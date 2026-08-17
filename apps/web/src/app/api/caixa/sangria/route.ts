import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/caixa/sangria — registra uma retirada de dinheiro do caixa aberto do operador ativo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, operatorId, operatorName, valor, motivo } = body;

    const valorNum = Number(valor);
    if (!operatorId || !valorNum || valorNum <= 0) {
      return NextResponse.json({ success: false, error: "operatorId e valor (maior que zero) são obrigatórios." }, { status: 400 });
    }

    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
    });
    if (!caixa) {
      return NextResponse.json({ success: false, error: "Nenhum caixa aberto para este operador." }, { status: 404 });
    }

    const movimento = await prisma.cashTransaction.create({
      data: {
        cashRegisterId: caixa.id,
        type: "SANGRIA",
        amount: valorNum,
        description: motivo || `Sangria de caixa — R$ ${valorNum.toFixed(2)}`,
        paymentMethod: "DINHEIRO",
      },
    });

    const session = await getSessionUser(req);
    await logActivity({
      tenantId: session?.tenantId || tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
      userId: session?.userId || operatorId,
      userName: session?.name || operatorName,
      action: "CASH_BLEED",
      description: `${session?.name || operatorName} realizou sangria de R$ ${valorNum.toFixed(2)} no caixa.`,
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
