import type { Prisma, PrismaClient, ComandaPaymentMethod, PdvPaymentCategory } from "@prisma/client";
import { round2 } from "@/lib/pdvSale";

type Db = Prisma.TransactionClient | PrismaClient;

// Lançamento de pagamentos de comanda no caixa. Compartilhado pelo pagamento parcial
// (adiantamento numa comanda aberta) e pelo acerto no fechamento. Cada linha de pagamento gera
// uma linha ComandaPayment e uma CashTransaction de ENTRADA.
//
// A forma de pagamento vem do cadastro (Cadastros → Formas de Pagamento). O cliente manda o
// `paymentMethodId`; o servidor resolve a `PaymentMethod`, valida contra o tenant e deriva:
//   - `method` (enum coarse ComandaPaymentMethod) a partir de `pdvCategory`;
//   - o rótulo no caixa (CashTransaction.paymentMethod);
//   - se cabe troco (só DINHEIRO) e se pede Bandeira/NSU (cartões — validado na UI).
//
// As flags de negócio da forma são honradas (só em comanda de hóspede, que tem hospedagem/saldo):
//   - `installment`         → o valor vai para Contas a Receber (AccountsReceivable);
//   - `debitGuestBalance`   → consome o saldo credor do hóspede (Guest.balance / GuestBalanceEntry);
//   - `sumsToCashRegister`  → false = Conta Corrente (não soma nos totais físicos do caixa).

// Categoria da forma → enum coarse gravado em ComandaPayment.method.
const CATEGORY_TO_METHOD: Record<PdvPaymentCategory, ComandaPaymentMethod> = {
  DINHEIRO: "DINHEIRO",
  CARTAO_DEBITO: "DEBITO",
  CARTAO_CREDITO: "CREDITO",
  PIX: "PIX",
  OUTRO: "OUTRO",
};

// Categoria da forma → rótulo em CashTransaction.paymentMethod (mantém os valores já usados
// historicamente para não quebrar relatórios de caixa que agrupam por essa string).
const CATEGORY_TO_CASH_LABEL: Record<PdvPaymentCategory, string> = {
  DINHEIRO: "DINHEIRO",
  CARTAO_DEBITO: "CARTAO_DEBITO",
  CARTAO_CREDITO: "CARTAO_CREDITO",
  PIX: "PIX",
  OUTRO: "OUTRO",
};

export type PdvPaymentInput = { paymentMethodId: string; valor: number; bandeira?: string; nsu?: string };

export type ResolvedPdvPayment = {
  paymentMethodId: string;
  methodLabel: string;
  method: ComandaPaymentMethod;
  category: PdvPaymentCategory;
  isCash: boolean;
  installment: boolean;
  debitGuestBalance: boolean;
  sumsToCashRegister: boolean;
  valor: number;
  bandeira?: string;
  nsu?: string;
};

export function normalizePagamentos(raw: unknown): PdvPaymentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: any) => ({
    paymentMethodId: String(p?.paymentMethodId || p?.formaId || "").trim(),
    valor: round2(Number(p?.valor) || 0),
    bandeira: p?.bandeira ? String(p.bandeira).trim() : undefined,
    nsu: p?.nsu ? String(p.nsu).trim() : undefined,
  }));
}

// Resolve cada pagamento contra o cadastro de Formas de Pagamento do tenant. Retorna a lista
// resolvida ou uma mensagem de erro (nunca as duas). `isHospede` = a comanda está vinculada a
// uma hospedagem — só nela as formas de parcelamento / débito de saldo fazem sentido.
export async function resolvePagamentos(
  db: Db,
  tenantId: string,
  inputs: PdvPaymentInput[],
  opts: { isHospede: boolean }
): Promise<{ pagamentos: ResolvedPdvPayment[]; error: string | null }> {
  if (inputs.length === 0) return { pagamentos: [], error: "Informe ao menos uma forma de pagamento." };
  if (inputs.some((p) => p.valor <= 0)) return { pagamentos: [], error: "O valor do pagamento deve ser maior que zero." };
  if (inputs.some((p) => !p.paymentMethodId)) return { pagamentos: [], error: "Selecione a forma de pagamento." };

  const ids = [...new Set(inputs.map((p) => p.paymentMethodId))];
  const methods = await db.paymentMethod.findMany({
    where: { id: { in: ids }, tenantId },
    select: {
      id: true,
      description: true,
      pdvCategory: true,
      installment: true,
      debitGuestBalance: true,
      transferDebit: true,
      sumsToCashRegister: true,
      active: true,
    },
  });
  const byId = new Map(methods.map((m) => [m.id, m]));

  const pagamentos: ResolvedPdvPayment[] = [];
  for (const p of inputs) {
    const m = byId.get(p.paymentMethodId);
    if (!m) return { pagamentos: [], error: "Forma de pagamento inválida." };
    if (m.active === false) return { pagamentos: [], error: `A forma "${m.description}" está inativa.` };
    if (m.transferDebit) {
      return {
        pagamentos: [],
        error: `A forma "${m.description}" é de Transferência de Débito entre quartos e não pode ser usada no pagamento da comanda.`,
      };
    }
    if ((m.installment || m.debitGuestBalance) && !opts.isHospede) {
      return {
        pagamentos: [],
        error: `A forma "${m.description}" só pode ser usada em comanda de hóspede (parcelamento / débito de saldo do hóspede).`,
      };
    }
    pagamentos.push({
      paymentMethodId: m.id,
      methodLabel: m.description,
      method: CATEGORY_TO_METHOD[m.pdvCategory],
      category: m.pdvCategory,
      isCash: m.pdvCategory === "DINHEIRO",
      installment: m.installment,
      debitGuestBalance: m.debitGuestBalance,
      sumsToCashRegister: m.sumsToCashRegister,
      valor: p.valor,
      bandeira: p.bandeira,
      nsu: p.nsu,
    });
  }
  return { pagamentos, error: null };
}

// Garante um caixa aberto para o operador (abre um novo automaticamente, como já fazem
// pagamento-checkin e pagamento-lote).
export async function ensureOpenCaixa(
  tx: Db,
  params: { tenantId: string; operatorId: string; operatorName: string }
): Promise<string> {
  const existing = await tx.cashRegister.findFirst({
    where: { operatorId: params.operatorId, isOpen: true, tenantId: params.tenantId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.cashRegister.create({
    data: {
      tenantId: params.tenantId,
      operatorId: params.operatorId,
      operatorName: params.operatorName.toUpperCase(),
      openingBalance: 0,
      isOpen: true,
    },
    select: { id: true },
  });
  return created.id;
}

// Grava as linhas ComandaPayment do evento e as CashTransaction correspondentes (uma por linha),
// aplicando as flags de negócio da forma, e devolve o valor líquido recebido (bruto − troco).
// `troco` (só em dinheiro, no fechamento de passante) é abatido da primeira linha DINHEIRO comum
// e NÃO reduz a receita registrada no caixa.
export async function postComandaPaymentEvent(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    sessionId: string;
    comandaNumber: string;
    customerName: string | null;
    cashRegisterId: string;
    kind: "ADVANCE" | "SETTLEMENT";
    pagamentos: ResolvedPdvPayment[];
    troco: number;
    operatorId: string;
    operatorName: string;
    hospede?: { stayCheckinId: string } | null;
  }
): Promise<number> {
  const { pagamentos } = params;
  const baseDesc =
    `PDV Restaurante — Comanda ${params.comandaNumber}` +
    (params.kind === "ADVANCE" ? " (pagamento parcial)" : "") +
    (params.customerName ? ` — ${params.customerName}` : "");

  // Dados do hóspede (só resolvidos se alguma linha precisa — parcelamento / débito de saldo).
  let hospedeInfo: {
    guestId: string | null;
    companyId: string | null;
    billedToName: string;
    balance: number;
    roomNumber: string | null;
  } | null = null;
  const precisaHospede = pagamentos.some((p) => p.installment || p.debitGuestBalance);
  if (precisaHospede) {
    if (!params.hospede?.stayCheckinId) {
      throw new Error("Forma de parcelamento / débito de saldo exige comanda de hóspede.");
    }
    const stay = await tx.stayCheckin.findUnique({
      where: { id: params.hospede.stayCheckinId },
      select: {
        room: { select: { number: true } },
        primaryGuest: {
          select: { id: true, fullName: true, balance: true, companyId: true, company: { select: { name: true } } },
        },
      },
    });
    const g = stay?.primaryGuest;
    hospedeInfo = {
      guestId: g?.id ?? null,
      companyId: g?.companyId ?? null,
      billedToName: g?.company?.name || g?.fullName || params.customerName || "Cliente",
      balance: Number(g?.balance ?? 0),
      roomNumber: stay?.room?.number ?? null,
    };
  }

  let trocoRestante = round2(Math.max(0, params.troco));
  let bruto = 0;

  for (const p of pagamentos) {
    bruto = round2(bruto + p.valor);
    const comum = !p.installment && !p.debitGuestBalance;
    const trocoLinha = comum && p.isCash && trocoRestante > 0 ? Math.min(trocoRestante, p.valor) : 0;
    trocoRestante = round2(trocoRestante - trocoLinha);

    let cashTxId: string;

    if (p.installment) {
      const issueDate = new Date();
      await tx.accountsReceivable.create({
        data: {
          tenantId: params.tenantId,
          stayCheckinId: params.hospede!.stayCheckinId,
          companyId: hospedeInfo!.companyId,
          guestId: hospedeInfo!.guestId,
          billedToName: hospedeInfo!.billedToName,
          documentNumber: `PDV-${params.comandaNumber}`,
          issueDate,
          dueDate: new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          amount: p.valor,
          paymentMethodDescription: p.methodLabel,
          notes: baseDesc,
        },
      });
      const mv = await tx.cashTransaction.create({
        data: {
          cashRegisterId: params.cashRegisterId,
          type: "ENTRADA",
          amount: p.valor,
          description: `${baseDesc} (Parcelado — Contas a Receber)`,
          paymentMethod: p.methodLabel.toUpperCase(),
          countsInCashTotal: false,
          guestName: params.customerName || null,
        },
        select: { id: true },
      });
      cashTxId = mv.id;
    } else if (p.debitGuestBalance) {
      if (!hospedeInfo!.guestId) throw new Error(`A forma "${p.methodLabel}" exige hóspede identificado.`);
      if (hospedeInfo!.balance < p.valor - 0.005) {
        throw new Error(
          `Saldo do hóspede insuficiente: disponível R$ ${hospedeInfo!.balance.toFixed(2)}, necessário R$ ${p.valor.toFixed(2)}.`
        );
      }
      hospedeInfo!.balance = round2(hospedeInfo!.balance - p.valor);
      await tx.guest.update({ where: { id: hospedeInfo!.guestId }, data: { balance: { decrement: p.valor } } });
      await tx.guestBalanceEntry.create({
        data: {
          tenantId: params.tenantId,
          guestId: hospedeInfo!.guestId,
          stayCheckinId: params.hospede!.stayCheckinId,
          type: "DEBITO",
          amount: p.valor,
          paymentMethodDescription: p.methodLabel,
          operatorId: params.operatorId,
          operatorName: params.operatorName,
          description: baseDesc,
        },
      });
      const mv = await tx.cashTransaction.create({
        data: {
          cashRegisterId: params.cashRegisterId,
          type: "ENTRADA",
          amount: p.valor,
          description: `${baseDesc} (Debitado do saldo do hóspede)`,
          paymentMethod: p.methodLabel.toUpperCase(),
          countsInCashTotal: false,
          guestName: params.customerName || null,
        },
        select: { id: true },
      });
      cashTxId = mv.id;
    } else {
      const mv = await tx.cashTransaction.create({
        data: {
          cashRegisterId: params.cashRegisterId,
          type: "ENTRADA",
          amount: round2(p.valor - trocoLinha),
          description: p.sumsToCashRegister ? baseDesc : `${baseDesc} (Conta corrente)`,
          paymentMethod: CATEGORY_TO_CASH_LABEL[p.category],
          countsInCashTotal: p.sumsToCashRegister,
          guestName: params.customerName || null,
        },
        select: { id: true },
      });
      cashTxId = mv.id;
    }

    await tx.comandaPayment.create({
      data: {
        comandaSessionId: params.sessionId,
        kind: params.kind,
        method: p.method,
        paymentMethodId: p.paymentMethodId,
        methodLabel: p.methodLabel,
        amount: p.valor,
        change: trocoLinha,
        cardBrand: p.bandeira || null,
        cardNsu: p.nsu || null,
        cashTransactionId: cashTxId,
        operatorId: params.operatorId,
        operatorName: params.operatorName,
      },
    });
  }

  return round2(bruto - Math.max(0, params.troco));
}
