import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/caixa/geral — lista todos os caixas (abertos e fechados) de todos os operadores do
// tenant do administrador autenticado, com totais por meio de pagamento. Restrito a
// SUPER_ADMIN/TENANT_ADMIN — a tela "Caixa Geral" usa isso para dar visão consolidada sem
// misturar caixas individuais de cada operador.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const forbidden = requireAdmin(session);
    if (forbidden) {
      return NextResponse.json(forbidden.body, { status: forbidden.status });
    }
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const caixas = await prisma.cashRegister.findMany({
      where: { tenantId: session!.tenantId },
      orderBy: { openedAt: "desc" },
      include: { transactions: true },
    });

    const rows = caixas.map((caixa) => {
      // Mesmo critério de apps/web/src/app/api/caixa/sessao/route.ts: lançamentos que não são
      // dinheiro físico (countsInCashTotal=false) ficam fora de todos os totais, inclusive dos
      // detalhamentos por meio de pagamento.
      const cashTransactions = caixa.transactions.filter((t) => t.type === "SANGRIA" || t.countsInCashTotal);

      const totalDinheiro = cashTransactions
        .filter((t) => t.type !== "SANGRIA" && t.paymentMethod === "DINHEIRO")
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalPix = cashTransactions
        .filter((t) => t.type === "ENTRADA" && t.paymentMethod === "PIX")
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalCartao = cashTransactions
        .filter((t) => t.type === "ENTRADA" && ["CARTAO", "CARTAO_CREDITO", "CARTAO_DEBITO"].includes(t.paymentMethod))
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalSangrias = cashTransactions
        .filter((t) => t.type === "SANGRIA")
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalEntradas = cashTransactions
        .filter((t) => t.type === "ENTRADA" || t.type === "SUPRIMENTO")
        .reduce((s, t) => s + Number(t.amount), 0);
      const saldoTotal = totalEntradas - totalSangrias;

      return {
        id: caixa.id,
        operatorId: caixa.operatorId,
        operatorName: caixa.operatorName,
        isOpen: caixa.isOpen,
        openedAt: caixa.openedAt,
        closedAt: caixa.closedAt,
        openingBalance: Number(caixa.openingBalance),
        closingBalance: caixa.closingBalance !== null ? Number(caixa.closingBalance) : null,
        totalDinheiro,
        totalPix,
        totalCartao,
        totalSangrias,
        saldoTotal,
      };
    });

    return NextResponse.json({ success: true, caixas: rows });
  } catch (error: any) {
    console.error("[GET /api/caixa/geral] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar caixas." }, { status: 500 });
  }
}
