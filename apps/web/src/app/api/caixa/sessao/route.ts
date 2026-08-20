import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/caixa/sessao — retorna o caixa aberto do operador autenticado (via cookie de sessão),
// com todas as movimentações. tenantId e operatorId vêm sempre da sessão do servidor, nunca de
// parâmetros enviados pelo cliente, para que um operador nunca possa ver o caixa de outro nem de
// outro tenant.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    if (!session.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId: session.userId, isOpen: true, tenantId: session.tenantId },
      orderBy: { openedAt: "desc" },
      include: { transactions: { orderBy: { createdAt: "asc" }, include: { accountPlan: true } } },
    });

    if (!caixa) {
      return NextResponse.json({ success: true, isOpen: false, caixa: null });
    }

    // Numeração sequencial do caixa (No.Caixa) para o relatório de impressão, seguindo a ordem
    // cronológica de aberturas do tenant — equivalente ao Cai_Numero do sistema WinDev original.
    const caixaNumero = await prisma.cashRegister.count({
      where: { tenantId: caixa.tenantId, openedAt: { lte: caixa.openedAt } },
    });

    // Lançamentos com hiddenFromCashLog=true (só a baixa de origem da transferência de débito
    // entre quartos) não aparecem nem na lista de movimentações do turno — nenhum dinheiro mudou
    // de mão ainda. Continuam visíveis no extrato da própria hospedagem (GET /api/caixa/conta-quarto).
    const visibleTransactions = caixa.transactions.filter((t) => !t.hiddenFromCashLog);

    // Lançamentos com countsInCashTotal=false (Conta Corrente, parcelamento, débito de saldo do
    // hóspede) aparecem normalmente na lista acima, mas ficam fora dos totais somados — não
    // representam dinheiro físico entrando no caixa neste momento.
    const cashTransactions = visibleTransactions.filter((t) => t.type === "SANGRIA" || t.countsInCashTotal);

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
      isOpen: true,
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
        transactions: visibleTransactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          description: t.description,
          paymentMethod: t.paymentMethod,
          countsInCashTotal: t.countsInCashTotal,
          guestName: t.guestName,
          roomNumber: t.roomNumber,
          createdAt: t.createdAt,
          accountPlanCode: t.accountPlan?.code ?? null,
          accountPlanDescription: t.accountPlan?.description ?? null,
        })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/caixa/sessao] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar sessão de caixa." }, { status: 500 });
  }
}
