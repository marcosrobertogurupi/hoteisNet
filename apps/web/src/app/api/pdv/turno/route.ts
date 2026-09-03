import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { round2 } from "@/lib/pdvSale";

const FORMA_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  DEBITO: "Cartão débito",
  CREDITO: "Cartão crédito",
  PIX: "PIX",
  CONTA_QUARTO: "Conta do quarto",
};

// GET /api/pdv/turno — resumo de vendas do PDV do operador logado no dia (ou ?data=YYYY-MM-DD):
// comandas fechadas, total, quebra por forma de pagamento / ponto de venda / status fiscal,
// adiantamentos recebidos e comandas ainda abertas. Base para o fechamento de turno.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dataParam = searchParams.get("data");
    const inicio = dataParam ? new Date(`${dataParam}T00:00:00`) : new Date();
    if (!dataParam) inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 1);
    const todos = searchParams.get("todos") === "1";

    const baseWhere = {
      tenantId: session.tenantId,
      ...(todos ? {} : { operatorId: session.userId }),
    };

    const [fechadas, abertas, pagamentos] = await Promise.all([
      prisma.comandaSession.findMany({
        where: { ...baseWhere, closedAt: { gte: inicio, lt: fim }, status: { not: "CANCELADA" } },
        select: {
          id: true,
          total: true,
          status: true,
          customerType: true,
          posLocation: { select: { name: true } },
        },
      }),
      prisma.comandaSession.count({ where: { ...baseWhere, status: "ABERTA" } }),
      prisma.comandaPayment.findMany({
        where: {
          comandaSession: baseWhere,
          createdAt: { gte: inicio, lt: fim },
        },
        select: { method: true, kind: true, amount: true, change: true },
      }),
    ]);

    const porForma: Record<string, number> = {};
    let adiantamentos = 0;
    for (const p of pagamentos) {
      const liquido = round2(Number(p.amount) - Number(p.change));
      porForma[p.method] = round2((porForma[p.method] || 0) + liquido);
      if (p.kind === "ADVANCE") adiantamentos = round2(adiantamentos + liquido);
    }

    const porPonto: Record<string, { qtd: number; total: number }> = {};
    const porStatusFiscal: Record<string, number> = {};
    let totalFechado = 0;
    let naContaQuarto = 0;
    for (const c of fechadas) {
      const t = Number(c.total);
      totalFechado = round2(totalFechado + t);
      const pv = c.posLocation?.name || "Sem ponto de venda";
      porPonto[pv] = { qtd: (porPonto[pv]?.qtd || 0) + 1, total: round2((porPonto[pv]?.total || 0) + t) };
      porStatusFiscal[c.status] = (porStatusFiscal[c.status] || 0) + 1;
      if (c.customerType === "HOSPEDE") naContaQuarto = round2(naContaQuarto + t);
    }

    return NextResponse.json({
      success: true,
      turno: {
        data: inicio.toISOString().slice(0, 10),
        escopo: todos ? "TODOS" : "MEU",
        comandasFechadas: fechadas.length,
        comandasAbertas: abertas,
        totalFechado,
        naContaQuarto,
        adiantamentosRecebidos: adiantamentos,
        porFormaPagamento: Object.entries(porForma).map(([forma, valor]) => ({
          forma,
          rotulo: FORMA_LABEL[forma] || forma,
          valor,
        })),
        porPontoVenda: Object.entries(porPonto).map(([nome, v]) => ({ nome, ...v })),
        porStatusFiscal,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/turno] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
