import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/caixa/abrir — abre um novo caixa para o operador ativo, lançando o fundo de troco
// como movimento de abertura (SUPRIMENTO), equivalente à Cai_Abertura do sistema WinDev original.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, operatorId, operatorName, fundoTroco } = body;

    if (!operatorId || !operatorName) {
      return NextResponse.json({ success: false, error: "operatorId e operatorName são obrigatórios." }, { status: 400 });
    }

    const opName = String(operatorName).toUpperCase();
    const fundoVal = Number(fundoTroco) || 0;
    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    const existing = await prisma.cashRegister.findFirst({
      where: { operatorId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Já existe um caixa aberto para este operador. Feche o caixa anterior antes de abrir um novo." },
        { status: 400 }
      );
    }

    const caixa = await prisma.$transaction(async (tx) => {
      const created = await tx.cashRegister.create({
        data: {
          tenantId: tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
          operatorId,
          operatorName: opName,
          openingBalance: fundoVal,
          isOpen: true,
        },
      });
      if (fundoVal > 0) {
        await tx.cashTransaction.create({
          data: {
            cashRegisterId: created.id,
            type: "SUPRIMENTO",
            amount: fundoVal,
            description: `Abertura do caixa — Fundo de troco: R$ ${fundoVal.toFixed(2)}`,
            paymentMethod: "DINHEIRO",
          },
        });
      }
      return created;
    });

    const session = await getSessionUser(req);
    await logActivity({
      tenantId: session?.tenantId || tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
      userId: session?.userId || operatorId,
      userName: session?.name || opName,
      action: "CASH_OPEN",
      description: `${session?.name || opName} abriu o caixa com fundo de troco de R$ ${fundoVal.toFixed(2)}.`,
      entityType: "CASH_REGISTER",
      entityId: caixa.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      caixaId: caixa.id,
      message: `Caixa aberto com sucesso para ${opName}!`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/abrir] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao abrir caixa." }, { status: 500 });
  }
}
