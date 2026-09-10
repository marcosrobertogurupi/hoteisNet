import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import {
  resolveRoomId,
  findConflictingReservation,
  findBlockingOpenStay,
  lockRoomsForReservation,
  nextReservationNumber,
} from "@/lib/reservationHelpers";
import { processReservationDeposit } from "@/lib/paymentProcessing";
import { resolveOperator } from "@/lib/operator";
import { checkDiscountAuthorization, reservationDiscountBase } from "@/lib/discountAuth";

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
    const { reservations = [] } = body;

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

      // Mesma trava de desconto de /api/reservations: acima do limite do assinante exige
      // autorização de administrador, revalidada no servidor (ver lib/discountAuth.ts).
      const discountAuth = await checkDiscountAuthorization(req, {
        tenantId: session.tenantId,
        discountAmount: r.discountAmount,
        baseAmount: await reservationDiscountBase(
          session.tenantId,
          r.tariffId,
          r.dailyRate,
          r.checkInDate,
          r.checkOutDate
        ),
        adminEmail: body.adminEmail,
        adminPassword: body.adminPassword,
      });
      if (discountAuth.failure) {
        return NextResponse.json(
          {
            ...discountAuth.failure.body,
            error: `Reserva ${i + 1} (${r.guestName || "sem nome"}): ${discountAuth.failure.body.error}`,
          },
          { status: discountAuth.failure.status }
        );
      }
    }

    const results = await txWithRetry(async (tx) => {
      const created: { reservationId: string; reservationNumber: string; roomId: string; guestName: string }[] = [];

      // O sinal (adiantamento) de cada reserva entra no caixa ABERTO do operador da sessão —
      // nunca um cashRegisterId nem um operatorId vindos do cliente (ver lib/operator.ts).
      // Só resolve/cria o caixa quando o lote tem de fato algum adiantamento a lançar.
      const { operatorId: opId, operatorName: opName } = resolveOperator(session);
      const loteTemAdiantamento = reservations.some(
        (r: any) => Array.isArray(r?.payments) && r.payments.some((p: any) => Number(p?.amount) > 0)
      );
      let realCashRegisterId: string | null = null;
      if (loteTemAdiantamento) {
        let caixa = await tx.cashRegister.findFirst({
          where: { operatorId: opId, isOpen: true, tenantId: session.tenantId! },
          select: { id: true },
        });
        if (!caixa) {
          caixa = await tx.cashRegister.create({
            data: { tenantId: session.tenantId!, operatorId: opId, operatorName: opName, openingBalance: 0, isOpen: true },
            select: { id: true },
          });
        }
        realCashRegisterId = caixa.id;
      }

      // Pré-resolve os quartos e trava todas as linhas de uma vez, em ordem de id, ANTES de checar
      // conflito e gravar — assim dois lotes concorrentes que compartilham quartos serializam sem
      // deadlock (mesma ordem de aquisição), em vez de ambos lerem "livre" e gravarem sobreposto.
      const resolvedRoomIds: string[] = [];
      for (const r of reservations) {
        resolvedRoomIds.push(await resolveRoomId(tx as any, String(r.roomId), session.tenantId!));
      }
      await lockRoomsForReservation(tx as any, resolvedRoomIds);

      for (let idx = 0; idx < reservations.length; idx++) {
        const r = reservations[idx];
        const realRoomId = resolvedRoomIds[idx];
        const checkInDate = new Date(r.checkInDate);
        const checkOutDate = new Date(r.checkOutDate);

        const conflict = await findConflictingReservation(tx as any, realRoomId, checkInDate, checkOutDate);
        if (conflict) {
          throw new Error(
            `Conflito de reserva: o quarto ${r.roomId} já possui a reserva de "${conflict.guestName}" sobrepondo o período informado para "${r.guestName}". Nenhuma reserva do lote foi salva.`
          );
        }

        const blockingStay = await findBlockingOpenStay(tx as any, realRoomId, checkInDate, checkOutDate);
        if (blockingStay) {
          throw new Error(
            `Conflito de reserva: o quarto ${r.roomId} está ocupado por uma hospedagem em aberto que se estende sobre o período informado para "${r.guestName}". Nenhuma reserva do lote foi salva.`
          );
        }

        let realGuestId: string | null = null;
        if (r.guestId) {
          const guest = await tx.guest.findFirst({ where: { id: r.guestId, tenantId: session.tenantId! }, select: { id: true } });
          realGuestId = guest?.id || null;
        }

        const reservationNumber = await nextReservationNumber(tx);
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
            operatorId: opId,
            operatorName: opName,
            notes: r.notes || null,
            roomDescription: r.roomDescription || null,
            roomCategory: r.roomCategory || null,
            roomFloor: r.roomFloor || null,
            reservationNumber,
            status: r.status || "CONFIRMED",
            preCheckinSent: false,
          },
        });

        const validPayments = ((r.payments || []) as any[]).filter((p) => Number(p?.amount) > 0);
        for (const pmt of validPayments) {
          if (!realCashRegisterId) break; // trava de segurança — loteTemAdiantamento já garantiu o caixa
          const { cashTransactionId } = await processReservationDeposit(tx, {
            tenantId: session.tenantId!,
            cashRegisterId: realCashRegisterId,
            reservationNumber,
            guestId: realGuestId,
            roomNumber: r.roomNumber || String(r.roomId),
            guestName: r.guestName,
            amount: Number(pmt.amount),
            paymentMethodDescription: pmt.paymentMethod || "DINHEIRO",
            operatorId: opId,
            operatorName: opName,
          });

          await tx.reservation_payments.create({
            data: {
              id: crypto.randomUUID(),
              reservationId: reservation.id,
              tenantId: RESERVATION_TENANT_ID,
              cashRegisterId: realCashRegisterId,
              cashTransactionId,
              amount: pmt.amount,
              paymentMethod: pmt.paymentMethod || "DINHEIRO",
              operatorId: opId,
              operatorName: opName,
            },
          });
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
