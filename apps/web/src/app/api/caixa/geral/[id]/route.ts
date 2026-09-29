import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/caixa/geral/[id] — detalhe completo (com movimentações) de um caixa específico do
// tenant do administrador autenticado, no mesmo formato de /api/caixa/sessao, para permitir a
// impressão de qualquer caixa (aberto ou fechado) a partir da tela "Caixa Geral". Restrito a
// SUPER_ADMIN/TENANT_ADMIN.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const forbidden = requireAdmin(session);
    if (forbidden) {
      return NextResponse.json(forbidden.body, { status: forbidden.status });
    }
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const { id } = await params;

    const caixa = await prisma.cashRegister.findFirst({
      where: { id, tenantId: session!.tenantId },
      include: { transactions: { orderBy: { createdAt: "asc" }, include: { accountPlan: true } } },
    });
    if (!caixa) {
      return NextResponse.json({ success: false, error: "Caixa não encontrado." }, { status: 404 });
    }

    const caixaNumero = await prisma.cashRegister.count({
      where: { tenantId: caixa.tenantId, openedAt: { lte: caixa.openedAt } },
    });

    // Mesma regra de /api/caixa/sessao: lançamentos que não representam dinheiro no caixa
    // (countsInCashTotal=false) e lançamentos ANULADOS continuam na lista, mas fora dos totais.
    const cashTransactions = caixa.transactions.filter((t) => !t.annulledAt && (t.type === "SANGRIA" || t.countsInCashTotal));

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

    return NextResponse.json({
      success: true,
      caixa: {
        id: caixa.id,
        caixaNumero,
        operatorId: caixa.operatorId,
        operatorName: caixa.operatorName,
        openingBalance: Number(caixa.openingBalance),
        openedAt: caixa.openedAt,
        closedAt: caixa.closedAt,
        totalDinheiro,
        totalPix,
        totalCartao,
        totalSangrias,
        saldoTotal,
        transactions: caixa.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          description: t.description,
          paymentMethod: t.paymentMethod,
          countsInCashTotal: t.countsInCashTotal,
          annulled: !!t.annulledAt,
          annulledByName: t.annulledByName,
          annulReason: t.annulReason,
          guestName: t.guestName,
          roomNumber: t.roomNumber,
          createdAt: t.createdAt,
          accountPlanCode: t.accountPlan?.code ?? null,
          accountPlanDescription: t.accountPlan?.description ?? null,
        })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/caixa/geral/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar caixa." }, { status: 500 });
  }
}
