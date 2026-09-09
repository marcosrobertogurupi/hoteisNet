import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { findConflictingReservation, findBlockingOpenStay, lockRoomsForReservation } from "@/lib/reservationHelpers";
import {
  waitlistCheckInAt,
  waitlistCheckOutAt,
  countWaitlistAhead,
  roomIdsHeldByOtherWaitlist,
  pastCheckInError,
} from "@/lib/waitlistMatch";

// Toda Reservation vive sob este tenantId fixo por convenção histórica do projeto — o isolamento
// real por hotel é via Reservation.room.tenantId (ver apps/web/src/app/api/reservations/route.ts).
const RESERVATION_TENANT_ID = "TNT-01";

// POST /api/waitlist/:id/convert — cria a reserva a partir de uma entrada da fila (WAITING ou
// NOTIFIED) e encerra a entrada como CONVERTED. Escolhe um quarto da categoria livre no período
// (a mesma régua de prioridade da reserva) e a tarifa pelo nº de adultos. Sem lançamento de sinal
// aqui — a recepção adiciona pagamento depois pela edição da reserva, se houver.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const tenantId = session.tenantId;
    const body = await req.json().catch(() => ({} as any));
    // "furar a fila": converter mesmo havendo entradas WAITING mais antigas para a mesma
    // categoria/período. A recepção confirma no modal antes de reenviar com este flag.
    const overrideQueue = body?.override === true;

    const outcome = await txWithRetry(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: { id, tenantId, status: { in: ["WAITING", "NOTIFIED"] } },
        select: {
          id: true,
          guestName: true,
          guestPhone: true,
          guestCpf: true,
          guestId: true,
          roomCategoryId: true,
          roomCategoryName: true,
          checkInDate: true,
          checkOutDate: true,
          adults: true,
          children: true,
          notifiedRoomId: true,
          status: true,
          createdAt: true,
        },
      });
      if (!entry) return { code: 404 as const, error: "Entrada não encontrada ou já encerrada." };

      // Datas no passado: a entrada pode ter envelhecido na fila até a chegada pedida já ter
      // passado. Não dá para criar uma reserva CONFIRMED no passado — a recepção edita o período
      // da entrada antes de converter.
      const pastErr = pastCheckInError(entry.checkInDate);
      if (pastErr) {
        return { code: 409 as const, error: `${pastErr} Edite o período da entrada antes de converter.` };
      }

      // Ordem da fila: uma entrada já NOTIFIED (a recepção/worker já a colocou na frente) passa
      // direto; caso contrário, se há entradas WAITING mais antigas para a mesma categoria/período,
      // a conversão só segue com o override explícito da recepção — e o "furo" fica registrado.
      let jumpedQueue = false;
      if (entry.status !== "NOTIFIED") {
        const ahead = await countWaitlistAhead(tx, { ...entry, tenantId });
        if (ahead.count > 0) {
          if (!overrideQueue) {
            return {
              code: 409 as const,
              needsQueueOverride: true as const,
              aheadCount: ahead.count,
              nextGuestName: ahead.nextGuestName,
              error:
                `Há ${ahead.count} hóspede(s) na frente na fila para ${entry.roomCategoryName} nesse período` +
                (ahead.nextGuestName ? ` (o próximo é ${ahead.nextGuestName})` : "") +
                `. Converta esse primeiro ou confirme para furar a fila.`,
            };
          }
          jumpedQueue = true;
        }
      }

      const checkIn = waitlistCheckInAt(entry.checkInDate);
      const checkOut = waitlistCheckOutAt(entry.checkOutDate);

      // Quartos candidatos: o quarto em "soft hold" desta entrada primeiro (se houver), senão
      // qualquer quarto ativo da categoria.
      const rooms = await tx.room.findMany({
        where: { tenantId, categoryId: entry.roomCategoryId, active: true },
        select: { id: true, number: true, floor: true },
      });

      // Serializa a conversão por quarto: sem isso, duas conversões concorrentes (recepção + worker,
      // ou dois terminais) escolhem o mesmo quarto livre e criam duas reservas sobrepostas.
      await lockRoomsForReservation(tx, rooms.map((r) => r.id));

      const ordered = entry.notifiedRoomId
        ? [...rooms].sort((a, b) => (a.id === entry.notifiedRoomId ? -1 : b.id === entry.notifiedRoomId ? 1 : 0))
        : rooms;

      // Quartos já prometidos (soft hold) a OUTRA entrada da fila avisada antes — não podem ser
      // usados aqui, senão a conversão rouba o quarto de quem foi avisado primeiro. O soft hold da
      // própria entrada não entra nessa lista (excludeWaitlistId) e continua sendo o preferido.
      const heldByOthers = await roomIdsHeldByOtherWaitlist(tx, {
        tenantId,
        roomIds: rooms.map((r) => r.id),
        checkIn: entry.checkInDate,
        checkOut: entry.checkOutDate,
        excludeWaitlistId: entry.id,
      });

      let chosen: (typeof rooms)[number] | null = null;
      for (const room of ordered) {
        if (heldByOthers.has(room.id)) continue;
        const [conflict, openStay] = await Promise.all([
          findConflictingReservation(tx, room.id, checkIn, checkOut),
          findBlockingOpenStay(tx, room.id, checkIn, checkOut),
        ]);
        if (!conflict && !openStay) {
          chosen = room;
          break;
        }
      }
      if (!chosen) {
        return { code: 409 as const, error: `Não há quarto livre da categoria ${entry.roomCategoryName} no período.` };
      }

      // Tarifa pela ocupação (adultos + crianças), igual ao check-in — Tariff.adults é a capacidade
      // da tarifa. A menor tarifa que cobre a ocupação. NUNCA cair na "mais barata" quando nenhuma
      // cobre: isso subfaturava (família grande pagando tarifa single). Sem tarifa que cubra → a
      // recepção ajusta o cadastro de tarifas ou o nº de pessoas.
      const occupants = entry.adults + entry.children;
      const tariff = await tx.tariff.findFirst({
        where: { tenantId, active: true, adults: { gte: occupants } },
        orderBy: [{ adults: "asc" }, { price: "asc" }],
      });
      if (!tariff) {
        const anyTariff = await tx.tariff.findFirst({ where: { tenantId, active: true }, select: { id: true } });
        return {
          code: 409 as const,
          error: anyTariff
            ? `Nenhuma tarifa cadastrada cobre ${occupants} hóspede(s). Cadastre uma tarifa adequada ou ajuste o número de pessoas da entrada antes de converter.`
            : "Hotel sem tarifa cadastrada — cadastre uma tarifa antes de converter.",
        };
      }

      // guestId revalidado contra o tenant.
      let realGuestId: string | null = null;
      if (entry.guestId) {
        const g = await tx.guest.findFirst({ where: { id: entry.guestId, tenantId }, select: { id: true } });
        realGuestId = g?.id || null;
      }

      const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (24 * 60 * 60 * 1000)));
      const totalAmount = Number(tariff.price) * nights;
      const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));

      const reservation = await tx.reservation.create({
        data: {
          tenantId: RESERVATION_TENANT_ID,
          roomId: chosen.id,
          guestName: entry.guestName,
          guestPhone: entry.guestPhone,
          guestCpf: entry.guestCpf,
          guestId: realGuestId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          tariffId: tariff.id,
          tariffName: tariff.name,
          dailyRate: tariff.price,
          totalDiarias: totalAmount,
          totalAmount,
          adults: entry.adults,
          children: entry.children,
          hasWhatsapp: !!entry.guestPhone,
          reservationNumber,
          roomDescription: chosen.number,
          roomCategory: entry.roomCategoryName,
          roomFloor: chosen.floor || null,
          status: "CONFIRMED",
          preCheckinSent: false,
          operatorId: session.userId || null,
          operatorName: session.name || null,
        },
        select: { id: true, reservationNumber: true },
      });

      await tx.waitlistEntry.updateMany({
        where: { id: entry.id, tenantId },
        data: {
          status: "CONVERTED",
          closedReason: "CONVERTED",
          convertedReservationId: reservation.id,
          notifiedRoomId: null,
          notifyExpiresAt: null,
        },
      });

      return { code: 200 as const, reservation, room: chosen.number, jumpedQueue };
    });

    if (outcome.code !== 200) {
      return NextResponse.json(
        {
          success: false,
          error: outcome.error,
          ...("needsQueueOverride" in outcome
            ? { needsQueueOverride: true, aheadCount: outcome.aheadCount, nextGuestName: outcome.nextGuestName }
            : {}),
        },
        { status: outcome.code },
      );
    }

    await prisma.humanEscalation.updateMany({
      where: { tenantId, entityType: "WAITLIST_MATCH", entityId: id, resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    });

    await logActivity({
      tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_CONVERT",
      description:
        `${session.name || "Usuário"} converteu uma entrada da fila de espera na reserva ${outcome.reservation.reservationNumber} (quarto ${outcome.room}).` +
        (outcome.jumpedQueue ? " [furou a fila — havia entradas mais antigas para a categoria/período]" : ""),
      entityType: "WAITLIST_ENTRY",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      reservationId: outcome.reservation.id,
      reservationNumber: outcome.reservation.reservationNumber,
      room: outcome.room,
    });
  } catch (error: any) {
    console.error("[POST /api/waitlist/:id/convert] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao converter a entrada." }, { status: 500 });
  }
}
