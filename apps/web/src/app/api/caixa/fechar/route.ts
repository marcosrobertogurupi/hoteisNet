import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/caixa/fechar — fecha (cegamente) o caixa aberto do operador ativo, calculando o
// saldo esperado a partir das movimentações gravadas.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, operatorId, saldoInformado } = body;

    if (!operatorId) {
      return NextResponse.json({ success: false, error: "operatorId é obrigatório." }, { status: 400 });
    }

    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
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

    const session = await getSessionUser(req);
    await logActivity({
      tenantId: session?.tenantId || tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
      userId: session?.userId || operatorId,
      userName: session?.name || caixa.operatorName,
      action: "CASH_CLOSE",
      description: `${session?.name || caixa.operatorName} fechou o caixa. Saldo calculado: R$ ${saldoCalculado.toFixed(2)}.`,
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
