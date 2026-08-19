import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// POST /api/caixa/sangria — registra uma retirada de dinheiro do caixa aberto do operador
// autenticado. operatorId/tenantId vêm sempre da sessão do servidor, nunca do corpo da
// requisição, para impedir que um operador lance sangria no caixa de outro.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    if (!session.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const { valor, motivo, accountPlanId } = body;

    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
      return NextResponse.json({ success: false, error: "Valor (maior que zero) é obrigatório." }, { status: 400 });
    }

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId: session.userId, isOpen: true, tenantId: session.tenantId },
    });
    if (!caixa) {
      return NextResponse.json({ success: false, error: "Nenhum caixa aberto para este operador." }, { status: 404 });
    }

    // Se um plano de contas foi informado (destino do recurso — ex: pagamento de despesa,
    // retirada para o cofre etc.), valida que ele pertence ao mesmo tenant antes de vincular.
    let validAccountPlanId: string | null = null;
    if (accountPlanId) {
      const plano = await prisma.accountPlan.findFirst({
        where: { id: accountPlanId, tenantId: session.tenantId },
      });
      validAccountPlanId = plano?.id ?? null;
    }

    const movimento = await prisma.cashTransaction.create({
      data: {
        cashRegisterId: caixa.id,
        type: "SANGRIA",
        amount: valorNum,
        description: motivo || `Retirada de caixa — R$ ${valorNum.toFixed(2)}`,
        paymentMethod: "DINHEIRO",
        accountPlanId: validAccountPlanId,
      },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CASH_BLEED",
      description: `${session.name} realizou sangria de R$ ${valorNum.toFixed(2)} no caixa.`,
      entityType: "CASH_TRANSACTION",
      entityId: movimento.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      sangriaId: movimento.id,
      message: `Sangria de R$ ${valorNum.toFixed(2)} executada com sucesso!`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/sangria] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar sangria." }, { status: 500 });
  }
}
