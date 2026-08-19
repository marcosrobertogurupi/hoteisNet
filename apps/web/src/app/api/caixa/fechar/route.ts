import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// POST /api/caixa/fechar — fecha (cegamente) o caixa aberto do operador autenticado, calculando o
// saldo esperado a partir das movimentações gravadas. operatorId/tenantId vêm sempre da sessão do
// servidor, nunca do corpo da requisição, para impedir que um operador feche o caixa de outro.
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
    const { saldoInformado } = body;

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId: session.userId, isOpen: true, tenantId: session.tenantId },
      include: { transactions: true },
    });
    if (!caixa) {
      return NextResponse.json({ success: false, error: "Nenhum caixa aberto para este operador." }, { status: 404 });
    }

    const totalEntradas = caixa.transactions
      .filter((t) => t.type === "ENTRADA" || t.type === "SUPRIMENTO")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalSangrias = caixa.transactions
      .filter((t) => t.type === "SANGRIA")
      .reduce((s, t) => s + Number(t.amount), 0);
    const saldoCalculado = totalEntradas - totalSangrias;
    const diferenca = Number(saldoInformado || 0) - saldoCalculado;

    await prisma.cashRegister.update({
      where: { id: caixa.id },
      data: { isOpen: false, closedAt: new Date(), closingBalance: saldoCalculado },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CASH_CLOSE",
      description: `${session.name} fechou o caixa. Saldo calculado: R$ ${saldoCalculado.toFixed(2)}.`,
      entityType: "CASH_REGISTER",
      entityId: caixa.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      caixaId: caixa.id,
      saldoCalculado,
      saldoInformado: Number(saldoInformado || 0),
      diferenca,
      status: diferenca === 0 ? "CAIXA_CONFERIDO" : diferenca > 0 ? "SOBRA" : "FALTA",
      message: `Caixa fechado. Saldo: R$ ${saldoCalculado.toFixed(2)}.`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/fechar] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao fechar caixa." }, { status: 500 });
  }
}
