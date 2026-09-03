import type { Prisma, PrismaClient } from "@prisma/client";
import { round2 } from "@/lib/pdvSale";

type Db = Prisma.TransactionClient | PrismaClient;

// Lançamento de pagamentos de comanda no caixa. Compartilhado pelo pagamento parcial
// (adiantamento numa comanda aberta) e pelo acerto no fechamento. Cada "evento" de pagamento
// gera as linhas ComandaPayment e UMA CashTransaction de ENTRADA (soma do evento).

export const PDV_METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "DINHEIRO",
  DEBITO: "CARTAO_DEBITO",
  CREDITO: "CARTAO_CREDITO",
  PIX: "PIX",
  CONTA_QUARTO: "CONTA_QUARTO",
};

export type PdvPaymentInput = { forma: string; valor: number; bandeira?: string; nsu?: string };

export function normalizePagamentos(raw: unknown): PdvPaymentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: any) => ({
    forma: String(p?.forma || "").toUpperCase(),
    valor: round2(Number(p?.valor) || 0),
    bandeira: p?.bandeira ? String(p.bandeira).trim() : undefined,
    nsu: p?.nsu ? String(p.nsu).trim() : undefined,
  }));
}

export function pagamentosInvalid(pgs: PdvPaymentInput[]): string | null {
  if (pgs.length === 0) return "Informe ao menos uma forma de pagamento.";
  if (pgs.some((p) => !PDV_METHOD_LABEL[p.forma])) return "Forma de pagamento inválida.";
  if (pgs.some((p) => p.valor <= 0)) return "O valor do pagamento deve ser maior que zero.";
  return null;
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
// foi lançado. `troco` (só em dinheiro) é gravado na primeira linha DINHEIRO e NÃO reduz a
// receita registrada no caixa (o valor lançado é `valorLiquido`).
export async function postComandaPaymentEvent(
  tx: Prisma.TransactionClient,
  params: {
    sessionId: string;
    comandaNumber: string;
    customerName: string | null;
    cashRegisterId: string;
    kind: "ADVANCE" | "SETTLEMENT";
    pagamentos: PdvPaymentInput[];
    troco: number;
    operatorId: string;
    operatorName: string;
  }
): Promise<number> {
  const { pagamentos, troco } = params;
  const bruto = round2(pagamentos.reduce((a, p) => a + p.valor, 0));
  const valorLiquido = round2(bruto - Math.max(0, troco));

  const metodos = [...new Set(pagamentos.map((p) => PDV_METHOD_LABEL[p.forma]))];
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
    const trocoLinha = p.forma === "DINHEIRO" && trocoRestante > 0 ? Math.min(trocoRestante, p.valor) : 0;
    trocoRestante = round2(trocoRestante - trocoLinha);
    await tx.comandaPayment.create({
      data: {
        comandaSessionId: params.sessionId,
        kind: params.kind,
        method: p.forma as any,
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
