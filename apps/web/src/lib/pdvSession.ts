import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { round2, itemTotal } from "@/lib/pdvSale";

// Select e serialização compartilhados de um atendimento (ComandaSession) do PDV, para as rotas
// não repetirem a montagem do payload nem trazerem colunas a mais.

export const SESSION_SELECT = {
  id: true,
  status: true,
  origin: true,
  customerType: true,
  stayCheckinId: true,
  tableId: true,
  cpfNota: true,
  customerName: true,
  customerPhone: true,
  discountAuthByName: true,
  operatorId: true,
  operatorName: true,
  subtotal: true,
  discount: true,
  total: true,
  paidAmount: true,
  openedAt: true,
  closedAt: true,
  comanda: { select: { id: true, number: true } },
  terminal: { select: { id: true, name: true } },
  table: { select: { id: true, number: true } },
  posLocation: { select: { id: true, name: true } },
  stayCheckin: { select: { id: true, room: { select: { number: true } }, primaryGuest: { select: { fullName: true } } } },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      dishId: true,
      productId: true,
      name: true,
      note: true,
      unitPrice: true,
      quantity: true,
      discount: true,
      total: true,
      canceled: true,
      canceledReason: true,
      canceledByUserName: true,
    },
  },
  payments: {
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, method: true, amount: true, change: true, cardBrand: true, cardNsu: true, createdAt: true },
  },
  fiscalDocuments: {
    orderBy: { createdAt: "desc" },
    select: { id: true, model: true, status: true, number: true, series: true, accessKey: true, rejectionReason: true },
  },
} as const;

type RawSession = Prisma.ComandaSessionGetPayload<{ select: typeof SESSION_SELECT }>;

export function serializeSession(s: RawSession) {
  return {
    id: s.id,
    status: s.status,
    origem: s.origin,
    tipoCliente: s.customerType,
    cpfNota: s.cpfNota,
    nomeCliente: s.customerName,
    telefoneCliente: s.customerPhone,
    descontoLiberadoPor: s.discountAuthByName,
    operador: { id: s.operatorId, nome: s.operatorName },
    comanda: s.comanda,
    caixa: s.terminal,
    mesa: s.table ? { id: s.table.id, numero: s.table.number } : null,
    pontoVenda: s.posLocation ? { id: s.posLocation.id, nome: s.posLocation.name } : null,
    hospedagem: s.stayCheckin
      ? { id: s.stayCheckin.id, quarto: s.stayCheckin.room?.number ?? null, hospede: s.stayCheckin.primaryGuest?.fullName ?? null }
      : null,
    subtotal: Number(s.subtotal),
    desconto: Number(s.discount),
    total: Number(s.total),
    pago: Number(s.paidAmount),
    saldo: round2(Number(s.total) - Number(s.paidAmount)),
    abertaEm: s.openedAt,
    fechadaEm: s.closedAt,
    itens: s.items.map((i) => ({
      id: i.id,
      dishId: i.dishId,
      productId: i.productId,
      nome: i.name,
      observacao: i.note,
      precoUnitario: Number(i.unitPrice),
      quantidade: Number(i.quantity),
      desconto: Number(i.discount),
      total: Number(i.total),
      cancelado: i.canceled,
      motivoCancelamento: i.canceledReason,
      canceladoPor: i.canceledByUserName,
    })),
    pagamentos: s.payments.map((p) => ({
      id: p.id,
      tipo: p.kind, // ADVANCE (parcial) | SETTLEMENT (fechamento)
      forma: p.method,
      valor: Number(p.amount),
      troco: Number(p.change),
      bandeira: p.cardBrand,
      nsu: p.cardNsu,
      em: p.createdAt,
    })),
    documentosFiscais: s.fiscalDocuments.map((d) => ({
      id: d.id,
      modelo: d.model,
      status: d.status,
      numero: d.number,
      serie: d.series,
      chave: d.accessKey,
      motivoRejeicao: d.rejectionReason,
    })),
  };
}

// Recalcula subtotal/total do atendimento a partir dos itens e do desconto de cabeçalho, e
// grava. Chamar sempre dentro da transação que alterou itens ou o desconto.
export async function recalcSessionTotals(
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<{ subtotal: number; discount: number; total: number }> {
  const s = await tx.comandaSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { discount: true, items: { select: { unitPrice: true, quantity: true, discount: true, canceled: true } } },
  });
  const subtotal = round2(
    s.items
      .filter((i) => !i.canceled)
      .reduce((acc, i) => acc + itemTotal(Number(i.unitPrice), Number(i.quantity), Number(i.discount)), 0)
  );
  const discount = Number(s.discount);
  const total = round2(Math.max(0, subtotal - discount));
  await tx.comandaSession.update({ where: { id: sessionId }, data: { subtotal, total } });
  return { subtotal, discount, total };
}

export function loadSession(sessionId: string, tenantId: string) {
  return prisma.comandaSession.findFirst({ where: { id: sessionId, tenantId }, select: SESSION_SELECT });
}
