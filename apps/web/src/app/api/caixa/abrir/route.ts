import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// POST /api/caixa/abrir — abre um novo caixa para o operador autenticado, lançando o fundo de
// troco como movimento de abertura (SUPRIMENTO), equivalente à Cai_Abertura do sistema WinDev
// original. operatorId/operatorName/tenantId vêm sempre da sessão do servidor, nunca do corpo da
// requisição, para impedir que um operador abra caixa em nome de outro ou em outro tenant.
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
    const { fundoTroco } = body;

    const operatorId = session.userId;
    const opName = String(session.name).toUpperCase();
    const fundoVal = Number(fundoTroco) || 0;

    const existing = await prisma.cashRegister.findFirst({
      where: { operatorId, isOpen: true, tenantId: session.tenantId },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Já existe um caixa aberto para este operador. Feche o caixa anterior antes de abrir um novo." },
        { status: 400 }
      );
    }

    const caixa = await txWithRetry(async (tx) => {
      const created = await tx.cashRegister.create({
        data: {
          tenantId: session.tenantId!,
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

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CASH_OPEN",
      description: `${session.name} abriu o caixa com fundo de troco de R$ ${fundoVal.toFixed(2)}.`,
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
