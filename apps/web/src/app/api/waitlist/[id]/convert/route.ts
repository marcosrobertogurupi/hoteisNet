import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { findConflictingReservation, findBlockingOpenStay } from "@/lib/reservationHelpers";
import { waitlistCheckInAt, waitlistCheckOutAt } from "@/lib/waitlistMatch";

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
        },
      });
      if (!entry) return { code: 404 as const, error: "Entrada não encontrada ou já encerrada." };

      const checkIn = waitlistCheckInAt(entry.checkInDate);
      const checkOut = waitlistCheckOutAt(entry.checkOutDate);

      // Quartos candidatos: o quarto em "soft hold" desta entrada primeiro (se houver), senão
      // qualquer quarto ativo da categoria.
      const rooms = await tx.room.findMany({
        where: { tenantId, categoryId: entry.roomCategoryId, active: true },
        select: { id: true, number: true, floor: true },
      });
      const ordered = entry.notifiedRoomId
        ? [...rooms].sort((a, b) => (a.id === entry.notifiedRoomId ? -1 : b.id === entry.notifiedRoomId ? 1 : 0))
        : rooms;

      let chosen: (typeof rooms)[number] | null = null;
      for (const room of ordered) {
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

      // Tarifa pelo nº de adultos (Tariff não tem categoryId — mesma regra do sistema legado).
      const tariff =
        (await tx.tariff.findFirst({
          where: { tenantId, active: true, adults: { gte: entry.adults } },
          orderBy: { adults: "asc" },
        })) ||
        (await tx.tariff.findFirst({ where: { tenantId, active: true }, orderBy: { price: "asc" } }));
      if (!tariff) {
        return { code: 409 as const, error: "Hotel sem tarifa cadastrada — cadastre uma tarifa antes de converter." };
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

      return { code: 200 as const, reservation, room: chosen.number };
    });

    if (outcome.code !== 200) {
      return NextResponse.json({ success: false, error: outcome.error }, { status: outcome.code });
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
      description: `${session.name || "Usuário"} converteu uma entrada da fila de espera na reserva ${outcome.reservation.reservationNumber} (quarto ${outcome.room}).`,
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
