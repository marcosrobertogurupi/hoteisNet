import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { findConflictingReservation } from "@/lib/reservationHelpers";

// PATCH /api/stay/period — grava no banco a previsão de saída (e, se informada, a tarifa da
// diária corrente) escolhida no modal "Alterar Período da Hospedagem". Esta é a ÚNICA fonte de
// verdade para StayCheckin.expectedCheckOut: alterar só a Reservation (via /api/reservations) ou
// só o estado local do front nunca deve bastar, senão o Mapa de Quartos/tela de check-out ficam
// mostrando a previsão antiga (StayCheckin é quem controla bloqueio de disponibilidade e cálculo
// de diária extra por virada — ver /api/stay/rollover).
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { stayCheckinId, expectedCheckOut, ratePerNight, tariffName } = body as {
      stayCheckinId?: string;
      expectedCheckOut?: string;
      ratePerNight?: number;
      tariffName?: string;
    };

    if (!stayCheckinId || !expectedCheckOut) {
      return NextResponse.json(
        { success: false, error: "stayCheckinId e expectedCheckOut são obrigatórios." },
        { status: 400 }
      );
    }

    const newExpectedCheckOut = new Date(expectedCheckOut);
    if (Number.isNaN(newExpectedCheckOut.getTime())) {
      return NextResponse.json({ success: false, error: "expectedCheckOut inválido." }, { status: 400 });
    }

    const result = await txWithRetry(async (tx) => {
      const stay = await tx.stayCheckin.findFirst({ where: { id: stayCheckinId, tenantId: session.tenantId! } });
      if (!stay) {
        throw new Error(`Hospedagem ${stayCheckinId} não encontrada.`);
      }
      if (stay.isClosed) {
        throw new Error("Esta hospedagem já foi encerrada e não pode mais ter o período alterado.");
      }
      if (newExpectedCheckOut <= stay.checkInDate) {
        throw new Error("A previsão de saída não pode ser anterior ou igual à data de chegada.");
      }

      const conflict = await findConflictingReservation(
        tx,
        stay.roomId,
        stay.checkInDate,
        newExpectedCheckOut,
        stay.reservationId || undefined
      );
      if (conflict) {
        throw new Error(
          `Já existe uma reserva (${conflict.reservationNumber || conflict.id}) para ${conflict.guestName} neste quarto entre ${conflict.checkInDate.toLocaleDateString("pt-BR")} e ${conflict.checkOutDate.toLocaleDateString("pt-BR")}. Não é possível prorrogar a previsão de saída além dessa data.`
        );
      }

      await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: { expectedCheckOut: newExpectedCheckOut },
      });

      // Se a tarifa da diária corrente mudou, reflete o novo valor na última diária já lançada
      // (a "diária corrente" da hospedagem) e recalcula o total — diárias passadas já cobradas
      // permanecem intocadas.
      if (ratePerNight !== undefined && Number.isFinite(Number(ratePerNight)) && Number(ratePerNight) >= 0) {
        const currentCharge = await tx.stayCharge.findFirst({
          where: { stayCheckinId, chargeType: "DAILY" },
          orderBy: { referenceDate: "desc" },
        });

        if (currentCharge && Number(currentCharge.amount) !== Number(ratePerNight)) {
          await tx.stayCharge.update({
            where: { id: currentCharge.id },
            data: {
              amount: Number(ratePerNight),
              description: tariffName || currentCharge.description,
            },
          });
        }
      }

      // Inclui a cobrança de chegada de madrugada/antecipada (EARLY_ARRIVAL) no acumulado —
      // senão ela sumiria de totalDaily quando o período é alterado.
      const chargesAgg = await tx.stayCharge.aggregate({
        where: { stayCheckinId, chargeType: { in: ["DAILY", "EARLY_ARRIVAL"] } },
        _sum: { amount: true },
      });

      const updatedStay = await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: { totalDaily: Number(chargesAgg._sum.amount || 0) },
        include: { charges: { where: { chargeType: "DAILY" }, orderBy: { referenceDate: "asc" } } },
      });

      return updatedStay;
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "STAY_PERIOD_CHANGE",
      description: `${session?.name || "Usuário"} alterou a previsão de saída da hospedagem ${stayCheckinId} para ${newExpectedCheckOut.toLocaleString("pt-BR")}.`,
      entityType: "STAY_CHECKIN",
      entityId: stayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      stayCheckinId: result.id,
      expectedCheckOut: result.expectedCheckOut,
      totalDaily: Number(result.totalDaily),
      dailyCharges: result.charges.map((c) => ({
        referenceDate: c.referenceDate,
        amount: Number(c.amount),
        description: c.description,
      })),
    });
  } catch (error: any) {
    console.error("[PATCH /api/stay/period] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao alterar o período da hospedagem." },
      { status: 500 }
    );
  }
}
