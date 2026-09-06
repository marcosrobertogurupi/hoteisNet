import type { Prisma, PrismaClient, ComandaPaymentMethod, PdvPaymentCategory } from "@prisma/client";
import { round2 } from "@/lib/pdvSale";

type Db = Prisma.TransactionClient | PrismaClient;

// Lançamento de pagamentos de comanda no caixa. Compartilhado pelo pagamento parcial
// (adiantamento numa comanda aberta) e pelo acerto no fechamento. Cada "evento" de pagamento
// gera as linhas ComandaPayment e UMA CashTransaction de ENTRADA (soma do evento).
//
// A forma de pagamento vem do cadastro (Cadastros → Formas de Pagamento). O cliente manda o
// `paymentMethodId`; o servidor resolve a `PaymentMethod`, valida contra o tenant e deriva:
//   - `method` (enum coarse ComandaPaymentMethod) a partir de `pdvCategory`;
//   - o rótulo no caixa (CashTransaction.paymentMethod);
//   - se cabe troco (só DINHEIRO) e se pede Bandeira/NSU (cartões — validado na UI).

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
// resolvida ou uma mensagem de erro (nunca as duas). Fase A: bloqueia formas com regras de
// negócio que o PDV ainda não executa (parcelamento, débito de saldo do hóspede, conta
// corrente) — a Fase B remove esse bloqueio e passa a honrá-las.
export async function resolvePagamentos(
  db: Db,
  tenantId: string,
  inputs: PdvPaymentInput[]
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
    if (m.installment || m.debitGuestBalance || !m.sumsToCashRegister) {
      return {
        pagamentos: [],
        error: `A forma "${m.description}" (parcelamento / débito de saldo do hóspede / conta corrente) ainda não é suportada no PDV. Use dinheiro, cartão ou PIX.`,
      };
    }
    pagamentos.push({
      paymentMethodId: m.id,
      methodLabel: m.description,
      method: CATEGORY_TO_METHOD[m.pdvCategory],
      category: m.pdvCategory,
      isCash: m.pdvCategory === "DINHEIRO",
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

// Grava as linhas ComandaPayment do evento e a CashTransaction correspondente, e devolve quanto
// foi lançado. `troco` (só em dinheiro) é gravado na primeira linha de categoria DINHEIRO e NÃO
// reduz a receita registrada no caixa (o valor lançado é `valorLiquido`).
export async function postComandaPaymentEvent(
  tx: Prisma.TransactionClient,
  params: {
    sessionId: string;
    comandaNumber: string;
    customerName: string | null;
    cashRegisterId: string;
    kind: "ADVANCE" | "SETTLEMENT";
    pagamentos: ResolvedPdvPayment[];
    troco: number;
    operatorId: string;
    operatorName: string;
  }
): Promise<number> {
  const { pagamentos, troco } = params;
  const bruto = round2(pagamentos.reduce((a, p) => a + p.valor, 0));
  const valorLiquido = round2(bruto - Math.max(0, troco));

  const metodos = [...new Set(pagamentos.map((p) => CATEGORY_TO_CASH_LABEL[p.category]))];
  const movimento = await tx.cashTransaction.create({
    data: {
      cashRegisterId: params.cashRegisterId,
      type: "ENTRADA",
      amount: valorLiquido,
      description:
        `PDV Restaurante — Comanda ${params.comandaNumber}` +
        (params.kind === "ADVANCE" ? " (pagamento parcial)" : "") +
        (params.customerName ? ` — ${params.customerName}` : ""),
      paymentMethod: metodos.length === 1 ? metodos[0] : "MULTIPLO",
      countsInCashTotal: true,
      guestName: params.customerName || null,
    },
    select: { id: true },
  });

  let trocoRestante = Math.max(0, troco);
  for (const p of pagamentos) {
    const trocoLinha = p.isCash && trocoRestante > 0 ? Math.min(trocoRestante, p.valor) : 0;
    trocoRestante = round2(trocoRestante - trocoLinha);
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
        cashTransactionId: movimento.id,
        operatorId: params.operatorId,
        operatorName: params.operatorName,
      },
    });
  }

  return valorLiquido;
}
