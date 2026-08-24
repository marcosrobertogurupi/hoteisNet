import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// PATCH /api/stay/tariff — grava no banco a tarifa escolhida pelo usuário no modal "Alterar Tarifa
// da Hospedagem" (aplicar em toda hospedagem / hoje em diante / apenas nos selecionados). O front
// já resolveu localmente QUAIS diárias mudam para qual modo — aqui só recebemos o resultado final
// (uma linha por diária, com a referenceDate original de cada StayCharge) e sincronizamos 1:1 com
// o banco, sem reinterpretar o modo no servidor.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { stayCheckinId, dailyRates } = body as {
      stayCheckinId?: string;
      dailyRates?: { referenceDate: string; tariffName: string; rateValue: number }[];
    };

    if (!stayCheckinId || !Array.isArray(dailyRates) || dailyRates.length === 0) {
      return NextResponse.json(
        { success: false, error: "stayCheckinId e dailyRates são obrigatórios." },
        { status: 400 }
      );
    }

    for (const item of dailyRates) {
      if (!item.referenceDate || !item.tariffName || !Number.isFinite(Number(item.rateValue)) || Number(item.rateValue) < 0) {
        return NextResponse.json(
          { success: false, error: "Cada diária precisa de referenceDate, tariffName e rateValue válidos." },
          { status: 400 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const stay = await tx.stayCheckin.findFirst({ where: { id: stayCheckinId, tenantId: session.tenantId! } });
      if (!stay) {
        throw new Error(`Hospedagem ${stayCheckinId} não encontrada.`);
      }
      if (stay.isClosed) {
        throw new Error("Esta hospedagem já foi encerrada e não pode mais ter a tarifa alterada.");
      }

      for (const item of dailyRates) {
        await tx.stayCharge.update({
          where: {
            stayCheckinId_referenceDate: {
              stayCheckinId,
              referenceDate: new Date(item.referenceDate),
            },
          },
          data: {
            description: item.tariffName,
            amount: Number(item.rateValue),
          },
        });
      }

      const chargesAgg = await tx.stayCharge.aggregate({
        where: { stayCheckinId, chargeType: "DAILY" },
        _sum: { amount: true },
        _count: true,
      });

      const totalDaily = Number(chargesAgg._sum.amount || 0);

      const updatedStay = await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: { totalDaily },
        include: { charges: { where: { chargeType: "DAILY" }, orderBy: { referenceDate: "asc" } } },
      });

      return updatedStay;
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "TARIFF_CHANGE",
      description: `${session?.name || "Usuário"} alterou a tarifa de ${dailyRates.length} diária(s) da hospedagem ${stayCheckinId}.`,
      entityType: "STAY_CHECKIN",
      entityId: stayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      stayCheckinId: result.id,
      totalDaily: Number(result.totalDaily),
      dailyCharges: result.charges.map((c) => ({
        referenceDate: c.referenceDate,
        amount: Number(c.amount),
        description: c.description,
      })),
    });
  } catch (error: any) {
    console.error("[PATCH /api/stay/tariff] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao alterar tarifa da hospedagem." },
      { status: 500 }
    );
  }
}
