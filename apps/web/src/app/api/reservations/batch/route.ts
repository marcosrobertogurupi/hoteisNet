import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { resolveRoomId, findConflictingReservation } from "@/lib/reservationHelpers";

// POST /api/reservations/batch — cria várias reservas de uma só vez, dentro de uma única
// transação Prisma (equivalente ao botão "Salvar Reservas" da tela de Reservas Múltiplas do
// projeto WinDev original: o usuário vai incluindo reservas em uma grade local, sem gravar nada,
// e só quando clica em "Salvar Reservas" tudo é persistido de uma vez). Se qualquer reserva do
// lote apresentar conflito de quarto/data ou falhar, NENHUMA reserva do lote é gravada.
// Ver comentário RESERVATION_TENANT_ID em ../route.ts — Reservation.tenantId é sempre este valor
// fixo por convenção histórica; o isolamento real por hotel é via Reservation.room.tenantId.
const RESERVATION_TENANT_ID = "TNT-01";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const {
      cashRegisterId,
      operatorName,
      reservations = [],
    } = body;

    if (!Array.isArray(reservations) || reservations.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Nenhuma reserva informada para salvar.",
      });
    }

    for (let i = 0; i < reservations.length; i++) {
      const r = reservations[i];
      if (!r.roomId || !r.guestName || !r.checkInDate || !r.checkOutDate || !r.tariffId) {
        return NextResponse.json({
          success: false,
          error: `Reserva ${i + 1} (${r.guestName || "sem nome"}): campos obrigatórios faltando (Quarto, Hóspede, Chegada, Saída ou Tarifa).`,
        });
      }
    }

    const results = await prisma.$transaction(async (tx) => {
      const created: { reservationId: string; reservationNumber: string; roomId: string; guestName: string }[] = [];

      // cashRegisterId, se informado, precisa ser um caixa do mesmo tenant — senão o adiantamento
      // seria lançado no caixa de outro hotel.
      let realCashRegisterId: string | null = null;
      if (cashRegisterId) {
        const caixa = await tx.cashRegister.findFirst({ where: { id: cashRegisterId, tenantId: session.tenantId! }, select: { id: true } });
        realCashRegisterId = caixa?.id || null;
      }

      for (const r of reservations) {
        const realRoomId = await resolveRoomId(tx as any, String(r.roomId), session.tenantId!);
        const checkInDate = new Date(r.checkInDate);
        const checkOutDate = new Date(r.checkOutDate);

        const conflict = await findConflictingReservation(tx as any, realRoomId, checkInDate, checkOutDate);
        if (conflict) {
          throw new Error(
            `Conflito de reserva: o quarto ${r.roomId} já possui a reserva de "${conflict.guestName}" sobrepondo o período informado para "${r.guestName}". Nenhuma reserva do lote foi salva.`
          );
        }

        let realGuestId: string | null = null;
        if (r.guestId) {
          const guest = await tx.guest.findFirst({ where: { id: r.guestId, tenantId: session.tenantId! }, select: { id: true } });
          realGuestId = guest?.id || null;
        }

        const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));
        const finalTotal = r.totalAmount ?? r.totalDiarias ?? 0;

        const reservation = await tx.reservation.create({
          data: {
            tenantId: RESERVATION_TENANT_ID,
            roomId: realRoomId,
            guestName: r.guestName,
            guestCpf: r.guestCpf || null,
            guestPhone: r.guestPhone || null,
            guestId: realGuestId,
            checkInDate,
            checkOutDate,
            tariffId: r.tariffId,
            tariffName: r.tariffName || null,
            dailyRate: r.dailyRate || 0,
            totalDiarias: r.totalDiarias || 0,
            discountAmount: r.discountAmount || 0,
            totalAmount: finalTotal,
            depositPaid: r.depositPaid || 0,
            adults: r.adults ?? 1,
            children: r.children ?? 0,
            hasWhatsapp: !!r.hasWhatsapp,
            wppSent: false,
            cashRegisterId: realCashRegisterId,
            operatorName: operatorName || null,
            notes: r.notes || null,
            roomDescription: r.roomDescription || null,
            roomCategory: r.roomCategory || null,
            roomFloor: r.roomFloor || null,
            reservationNumber,
            status: r.status || "CONFIRMED",
            preCheckinSent: false,
          },
        });

        const validPayments = ((r.payments || []) as any[]).filter((p) => p.amount && p.amount > 0);
        for (const pmt of validPayments) {
          await tx.reservation_payments.create({
            data: {
              id: crypto.randomUUID(),
              reservationId: reservation.id,
              tenantId: RESERVATION_TENANT_ID,
              cashRegisterId: realCashRegisterId,
              amount: pmt.amount,
              paymentMethod: pmt.paymentMethod || "DINHEIRO",
              operatorName: operatorName || null,
            },
          });

          if (realCashRegisterId) {
            await tx.cashTransaction.create({
              data: {
                cashRegisterId: realCashRegisterId,
                type: "INCOME",
                amount: pmt.amount,
                description: `Adiantamento Reserva ${reservationNumber} - ${r.guestName}`,
                paymentMethod: pmt.paymentMethod || "DINHEIRO",
              },
            });
          }
        }

        created.push({
          reservationId: reservation.id,
          reservationNumber,
          roomId: r.roomId,
          guestName: r.guestName,
        });
      }

      return created;
    });

    for (const created of results) {
      await logActivity({
        tenantId: session.tenantId,
        userId: session.userId,
        userName: session.name,
        action: "RESERVATION_CREATE",
        description: `${session?.name || "Usuário"} criou a reserva ${created.reservationNumber} (${created.guestName}, quarto ${created.roomId}) via Reservas Múltiplas.`,
        entityType: "RESERVATION",
        entityId: created.reservationId,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
    }

    return NextResponse.json({
      success: true,
      reservations: results,
      message: `${results.length} reserva(s) salva(s) com sucesso!`,
    });
  } catch (error: any) {
    console.error("[POST /api/reservations/batch] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro interno ao salvar reservas em lote." });
  }
}
