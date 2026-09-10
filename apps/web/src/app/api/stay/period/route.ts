import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { findConflictingReservation } from "@/lib/reservationHelpers";
import { adjustGuestStayDebit } from "@/lib/guestStayDebit";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";
import { verifyAdminStepUp } from "@/lib/adminAuth";

function nightsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.round((dateOnlyBrasilia(to).getTime() - dateOnlyBrasilia(from).getTime()) / 86_400_000)
  );
}

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
    const { stayCheckinId, expectedCheckOut, ratePerNight, tariffId } = body as {
      stayCheckinId?: string;
      expectedCheckOut?: string;
      ratePerNight?: number;
      tariffId?: string | null;
      tariffName?: string;
    };
    let tariffName: string | undefined = body.tariffName;

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

    // tariffId (quando informado) precisa ser tarifa ATIVA do próprio tenant. Resolve nome canônico
    // e preço de referência (base correta do controle de desconto abaixo).
    let referencePrice: number | null = null;
    if (tariffId) {
      const tariff = await prisma.tariff.findFirst({
        where: { id: String(tariffId), tenantId: session.tenantId, active: true },
        select: { name: true, price: true },
      });
      if (!tariff) {
        return NextResponse.json(
          { success: false, error: "Tarifa selecionada não encontrada no cadastro do estabelecimento." },
          { status: 400 }
        );
      }
      tariffName = tariff.name;
      referencePrice = Number(tariff.price);
    }

    // ── Controle de desconto (autoritativo no servidor) ────────────────────────────────────
    // Baixar a tarifa da diária corrente é um desconto implícito — sem esta trava dava para
    // driblar o Tenant.maxDiscountPercent por aqui. Se a nova diária ficar mais barata que o
    // limite do tenant permite, exige autorização de administrador (mesmo verifyAdminStepUp do
    // check-in / pagamento-lote / stay/tariff).
    if (ratePerNight !== undefined && Number.isFinite(Number(ratePerNight)) && Number(ratePerNight) >= 0) {
      const staySc = await prisma.stayCheckin.findFirst({
        where: { id: stayCheckinId, tenantId: session.tenantId },
        select: { id: true },
      });
      if (!staySc) {
        return NextResponse.json({ success: false, error: `Hospedagem ${stayCheckinId} não encontrada.` }, { status: 404 });
      }
      const currentCharge = await prisma.stayCharge.findFirst({
        where: { stayCheckinId, chargeType: "DAILY" },
        orderBy: { referenceDate: "desc" },
        select: { amount: true },
      });
      // Base do desconto: preço da tarifa cadastrada quando o modal manda tariffId; senão a diária
      // corrente lançada (fallback para o modal ainda em lista mock).
      const antes = referencePrice ?? Number(currentCharge?.amount ?? 0);
      const reducaoPercent = antes > 0 ? ((antes - Number(ratePerNight)) / antes) * 100 : 0;
      if (reducaoPercent > 0.001) {
        const tenantForDiscount = await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: { maxDiscountPercent: true },
        });
        const limite = Number(tenantForDiscount?.maxDiscountPercent ?? 20);
        if (reducaoPercent > limite + 0.001) {
          const auth = await verifyAdminStepUp(req, body.adminEmail, body.adminPassword, session.tenantId);
          if (!auth.ok) {
            return NextResponse.json(
              { success: false, error: auth.error, precisaAutorizacao: true, limitePercent: limite },
              { status: auth.status }
            );
          }
        }
      }
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

      const prevExpectedCheckOut = stay.expectedCheckOut;

      await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: { expectedCheckOut: newExpectedCheckOut },
      });

      // Se a tarifa da diária corrente mudou, reflete o novo valor na última diária já lançada
      // (a "diária corrente" da hospedagem) e recalcula o total — diárias passadas já cobradas
      // permanecem intocadas.
      const currentCharge = await tx.stayCharge.findFirst({
        where: { stayCheckinId, chargeType: "DAILY" },
        orderBy: { referenceDate: "desc" },
      });
      const hasNewRate =
        ratePerNight !== undefined && Number.isFinite(Number(ratePerNight)) && Number(ratePerNight) >= 0;
      const effectiveRate = hasNewRate ? Number(ratePerNight) : Number(currentCharge?.amount ?? 0);

      let dailyRateDelta = 0;
      if (hasNewRate && currentCharge && Number(currentCharge.amount) !== Number(ratePerNight)) {
        dailyRateDelta = Number(ratePerNight) - Number(currentCharge.amount);
        await tx.stayCharge.update({
          where: { id: currentCharge.id },
          data: {
            amount: Number(ratePerNight),
            description: tariffName || currentCharge.description,
          },
        });
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

      // Ajuste no saldo do hóspede para acompanhar o novo valor devido pela hospedagem:
      //  • mudança da tarifa da diária corrente (uma noite): delta direto.
      //  • prorrogação da previsão de saída: as noites a mais são pré-debitadas agora (mesmo que o
      //    check-in fez com o período original), senão a virada automática não as debita — ela só
      //    debita o que passa da previsão de saída, que já é a nova — e sobraria crédito no
      //    check-out. Encurtar a previsão NÃO credita nada automaticamente: reduzir a conta de uma
      //    hospedagem é ato deliberado (desconto/estorno pelo operador), não efeito colateral.
      const addedNights = Math.max(
        0,
        nightsBetween(stay.checkInDate, newExpectedCheckOut) - nightsBetween(stay.checkInDate, prevExpectedCheckOut)
      );
      const periodDelta = addedNights * effectiveRate;
      const totalBalanceDelta = dailyRateDelta + periodDelta;
      if (totalBalanceDelta !== 0) {
        await adjustGuestStayDebit(tx, {
          tenantId: stay.tenantId,
          guestId: stay.primaryGuestId,
          stayCheckinId,
          delta: totalBalanceDelta,
          description:
            addedNights > 0
              ? `Ajuste de período/tarifa da hospedagem (+${addedNights} diária(s)) — ${stayCheckinId}`
              : `Ajuste de tarifa da diária corrente — hospedagem ${stayCheckinId}`,
        });
      }

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
