import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// Profundidade da conta na árvore do plano de contas (ex: 01.01.03.00 -> 3 | 01.01.03.01 -> 4).
function codeDepth(codigo: string): number {
  const segments = codigo.split(".");
  let depth = 1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== "00" && segments[i] !== "0") depth = i + 1;
  }
  return depth;
}

// Uma conta é Sintética de fato se existir outra conta cujo código a "estenda" (mesmo prefixo,
// porém mais profunda) — ela é totalizada pelas contas filha. Verificado estruturalmente a
// partir dos códigos, e não apenas pelo campo "level" salvo no banco, pois cadastros antigos
// podem estar com esse campo incorreto (ex: uma conta-grupo marcada como Analítica por engano).
function hasChildAccounts(codigo: string, allCodes: string[]): boolean {
  const depth = codeDepth(codigo);
  const prefix = codigo.split(".").slice(0, depth).join(".");
  return allCodes.some((other) => {
    if (other === codigo) return false;
    const otherDepth = codeDepth(other);
    if (otherDepth <= depth) return false;
    return other.split(".").slice(0, depth).join(".") === prefix;
  });
}

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
    // retirada para o cofre etc.), valida que ele pertence ao mesmo tenant e que é uma conta
    // Analítica antes de vincular. Contas Sintéticas são apenas totalizadoras de suas contas
    // filha e nunca podem receber lançamentos diretos.
    let validAccountPlanId: string | null = null;
    if (accountPlanId) {
      const plano = await prisma.accountPlan.findFirst({
        where: { id: accountPlanId, tenantId: session.tenantId },
      });
      if (!plano) {
        return NextResponse.json({ success: false, error: "Plano de contas inválido." }, { status: 400 });
      }
      const siblings = await prisma.accountPlan.findMany({
        where: { tenantId: session.tenantId, type: plano.type },
        select: { code: true },
      });
      const isSintetica = plano.level === "Sintética" || hasChildAccounts(plano.code, siblings.map((s) => s.code));
      if (isSintetica) {
        return NextResponse.json(
          { success: false, error: "Não é permitido lançar em conta Sintética. Selecione uma conta Analítica." },
          { status: 400 }
        );
      }
      validAccountPlanId = plano.id;
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
