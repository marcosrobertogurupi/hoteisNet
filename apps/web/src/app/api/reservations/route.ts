import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { resolveRoomId, findConflictingReservation, lockRoomsForReservation } from "@/lib/reservationHelpers";
import { reservationsMapVersion, notModifiedResponse } from "@/lib/mapVersion";
import { reservationsMapPayload } from "@/lib/mapQueries";
import { txWithRetry } from "@/lib/dbTx";
import { processReservationDeposit, reverseReservationDeposits } from "@/lib/paymentProcessing";
import { jsonForTenant } from "@/lib/tenantResponse";

// Erro dedicado para conflito de overbooking (quarto já reservado no período) — permite ao catch
// de cada handler devolver 409 especificamente para esse caso, distinto de um erro genérico (500).
class ReservationConflictError extends Error {}

// Toda Reservation vive sob este tenantId fixo por convenção histórica deste projeto — o
// isolamento real por hotel é sempre via Reservation.room.tenantId (ver comentário em
// lib/preCheckinSender.ts). Nunca usar o tenantId do cliente/sessão como valor deste campo.
const RESERVATION_TENANT_ID = "TNT-01";

// GET /api/reservations — lista reservas do tenant da sessão (Mapa de Reservas / lista sintética).
// A montagem do payload vive em lib/mapQueries.ts (reservationsMapPayload), compartilhada com a
// rota consolidada /api/mapa/reservas-tick.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    // Resposta condicional: se nada que o Mapa de Reservas desenha mudou desde a última vez, o
    // navegador recebe 304 (sem corpo) e o polling de 3 s não baixa o dataset de novo. Só as
    // consultas de contagem/timestamp (baratas) rodam nesse caso. Ver lib/mapVersion.ts.
    const etag = `"resv-${await reservationsMapVersion(session.tenantId)}"`;
    const notModified = notModifiedResponse(req, etag);
    if (notModified) return notModified;

    const reservations = await reservationsMapPayload(session.tenantId);

    return jsonForTenant(
      session.tenantId,
      { success: true, reservations },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/reservations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message });
  }
}

// POST /api/reservations — cria uma nova reserva
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const {
      roomId,
      tariffId,
      tariffName,
      guestName,
      guestCpf,
      guestPhone,
      guestId,
      checkInDate,
      checkOutDate,
      dailyRate,
      totalDiarias,
      discountAmount = 0,
      totalAmount,
      depositPaid = 0,
      adults = 1,
      children = 0,
      hasWhatsapp = false,
      operatorId,
      operatorName,
      notes,
      roomDescription,
      roomCategory,
      roomFloor,
      status = "CONFIRMED",
      payments = [], // array of { amount, paymentMethod }
    } = body;

    if (!roomId || !guestName || !checkInDate || !checkOutDate || !tariffId) {
      return NextResponse.json({
        success: false,
        error: "Campos obrigatórios faltando: Quarto, Hóspede, Chegada, Saída ou Tarifa.",
      });
    }

    const result = await txWithRetry(async (tx) => {
      const realRoomId = await resolveRoomId(tx as any, String(roomId), session.tenantId!);
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);

      // Trava a linha do quarto pelo resto da transação ANTES de checar conflito: sem isso, duas
      // criações concorrentes para o mesmo quarto/período leem "livre" ao mesmo tempo e ambas
      // gravam (READ COMMITTED não enxerga o INSERT não commitado da outra).
      await lockRoomsForReservation(tx as any, [realRoomId]);

      // Bloqueia overbooking: mesmo padrão já usado em /api/reservations/batch e /api/stay/period —
      // a checagem roda dentro da própria transação para ser atômica (nunca só uma validação de UI).
      const conflict = await findConflictingReservation(tx as any, realRoomId, checkIn, checkOut);
      if (conflict) {
        throw new ReservationConflictError(
          `Já existe uma reserva confirmada para este quarto neste período (reserva de "${conflict.guestName}").`
        );
      }

      // guestId, se informado, precisa pertencer ao mesmo tenant — senão a reserva ficaria
      // vinculada ao hóspede de outro hotel.
      let realGuestId: string | null = null;
      if (guestId) {
        const guest = await tx.guest.findFirst({ where: { id: guestId, tenantId: session.tenantId! }, select: { id: true } });
        realGuestId = guest?.id || null;
      }

      const validPayments = (payments as any[]).filter((p) => Number(p?.amount) > 0);

      // O sinal (adiantamento) entra no caixa ABERTO do operador da sessão — nunca um
      // cashRegisterId vindo do cliente (que permitiria lançar no caixa de outro hotel/operador).
      // Só resolve/cria o caixa quando há de fato um adiantamento a lançar.
      const opId = operatorId || "USR-001";
      const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();
      let realCashRegisterId: string | null = null;
      if (validPayments.length > 0) {
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

      const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));
      const finalTotal = totalAmount || totalDiarias || 0;

      const reservation = await tx.reservation.create({
        data: {
          tenantId: RESERVATION_TENANT_ID,
          roomId: realRoomId,
          guestName,
          guestCpf: guestCpf || null,
          guestPhone: guestPhone || null,
          guestId: realGuestId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          tariffId,
          tariffName: tariffName || null,
          dailyRate: dailyRate || 0,
          totalDiarias: totalDiarias || 0,
          discountAmount: discountAmount || 0,
          totalAmount: finalTotal,
          depositPaid: depositPaid || 0,
          adults,
          children,
          hasWhatsapp: !!hasWhatsapp,
          wppSent: false,
          cashRegisterId: realCashRegisterId,
          operatorId: operatorId || null,
          operatorName: operatorName || null,
          notes: notes || null,
          roomDescription: roomDescription || null,
          roomCategory: roomCategory || null,
          roomFloor: roomFloor || null,
          reservationNumber,
          status: status || "CONFIRMED",
          preCheckinSent: false,
        },
      });

      if (["CHECKED_IN", "CHECKEDIN", "OCCUPIED"].includes(String(status).toUpperCase())) {
        await tx.room.update({ where: { id: realRoomId }, data: { status: "OCCUPIED" } });
      }

      if (validPayments.length > 0 && realCashRegisterId) {
        const room = await tx.room.findUnique({ where: { id: realRoomId }, select: { number: true } });
        for (const pmt of validPayments) {
          const { cashTransactionId } = await processReservationDeposit(tx, {
            tenantId: session.tenantId!,
            cashRegisterId: realCashRegisterId,
            reservationNumber,
            guestId: realGuestId,
            roomNumber: room?.number || String(roomId),
            guestName,
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
      }

      return { reservationId: reservation.id, reservationNumber };
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "RESERVATION_CREATE",
      description: `${session?.name || "Usuário"} criou a reserva ${result.reservationNumber} (${guestName}, quarto ${roomId}).`,
      entityType: "RESERVATION",
      entityId: result.reservationId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Reserva ${result.reservationNumber} criada com sucesso!`,
    });
  } catch (error: any) {
    console.error("[POST /api/reservations] Erro:", error);
    const status = error instanceof ReservationConflictError ? 409 : undefined;
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao salvar reserva." },
      status ? { status } : undefined
    );
  }
}

// PATCH /api/reservations — atualiza/move uma reserva existente
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      roomId,
      checkInDate,
      checkOutDate,
      guestName,
      guestCpf,
      guestPhone,
      dailyRate,
      depositPaid,
      totalAmount,
      status,
      notes,
      operatorId,
      operatorName,
      // Reconciliação de adiantamentos feita pela tela de edição da reserva: novos adiantamentos
      // a lançar e ids de reservation_payments a estornar. Quando qualquer um dos dois é enviado,
      // o depositPaid é recalculado no servidor a partir da soma real (o valor do cliente é ignorado).
      addedPayments = [],
      removedPaymentIds = [],
    } = body;

    const reconcilesPayments =
      (Array.isArray(addedPayments) && addedPayments.length > 0) ||
      (Array.isArray(removedPaymentIds) && removedPaymentIds.length > 0);

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }

    await txWithRetry(async (tx) => {
      const existing = await tx.reservation.findFirst({ where: { id, room: { tenantId: session.tenantId! } } });
      if (!existing) {
        throw new Error(`Reserva ${id} não encontrada.`);
      }

      const realRoomId = roomId ? await resolveRoomId(tx as any, String(roomId), session.tenantId!) : undefined;
      const effectiveCheckIn = checkInDate ? new Date(checkInDate) : existing.checkInDate;
      const effectiveCheckOut = checkOutDate ? new Date(checkOutDate) : existing.checkOutDate;

      // Bloqueia overbooking na edição/movimentação (inclui o drag-and-drop no Mapa de Reservas) —
      // mesmo padrão de findConflictingReservation usado em batch/route.ts e stay/period/route.ts.
      // Só precisa checar quando quarto e/ou datas realmente mudam; edições de outros campos
      // (nome, notas, etc.) não afetam ocupação e não precisam revalidar o período.
      if (realRoomId !== undefined || checkInDate || checkOutDate) {
        // Trava o(s) quarto(s) envolvidos (o atual e o de destino, se mudou) antes de revalidar o
        // período — impede que uma edição/movimentação concorrente para o mesmo quarto crie
        // sobreposição.
        await lockRoomsForReservation(tx as any, [existing.roomId, realRoomId]);
        const conflict = await findConflictingReservation(
          tx as any,
          realRoomId ?? existing.roomId,
          effectiveCheckIn,
          effectiveCheckOut,
          id
        );
        if (conflict) {
          throw new ReservationConflictError(
            `Já existe uma reserva confirmada para este quarto neste período (reserva de "${conflict.guestName}").`
          );
        }
      }

      const data: Record<string, unknown> = {};
      if (realRoomId !== undefined) data.roomId = realRoomId;
      if (checkInDate) data.checkInDate = effectiveCheckIn;
      if (checkOutDate) data.checkOutDate = effectiveCheckOut;
      if (guestName) data.guestName = guestName;
      if (guestCpf !== undefined) data.guestCpf = guestCpf;
      if (guestPhone !== undefined) data.guestPhone = guestPhone;
      if (dailyRate !== undefined) data.dailyRate = dailyRate;
      // Quando a tela reconcilia adiantamentos (add/remove), o depositPaid vem do recálculo abaixo,
      // não do valor enviado pelo cliente.
      if (depositPaid !== undefined && !reconcilesPayments) data.depositPaid = depositPaid;
      if (totalAmount !== undefined) data.totalAmount = totalAmount;
      if (notes !== undefined) data.notes = notes;
      if (status) data.status = status;

      const updated = await tx.reservation.updateMany({
        where: { id, room: { tenantId: session.tenantId! } },
        data,
      });

      if (updated.count === 0) {
        throw new Error(`Reserva ${id} não encontrada.`);
      }

      // ── Reconciliação de adiantamentos editados na tela de edição da reserva ──────────────
      // Igual à criação: o valor entra/estorna no caixa ABERTO do operador da sessão, na mesma
      // transação. Regra do usuário: "qualquer pagamento deve cair no caixa do operador".
      if (reconcilesPayments) {
        const opId = operatorId || "USR-001";
        const opName = (operatorName || session.name || "OPERADOR RECEPÇÃO").toUpperCase();

        const removedIds = (Array.isArray(removedPaymentIds) ? removedPaymentIds : []).map(String).filter(Boolean);
        if (removedIds.length > 0) {
          await reverseReservationDeposits(tx, {
            tenantId: session.tenantId!,
            reservationId: id,
            reservationNumber: existing.reservationNumber,
            guestId: existing.guestId,
            onlyPaymentIds: removedIds,
          });
          await tx.reservation_payments.deleteMany({ where: { id: { in: removedIds }, reservationId: id } });
        }

        const addedValid = (Array.isArray(addedPayments) ? addedPayments : []).filter((p: any) => Number(p?.amount) > 0);
        if (addedValid.length > 0) {
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
          const room = await tx.room.findUnique({ where: { id: existing.roomId }, select: { number: true } });
          for (const pmt of addedValid) {
            const { cashTransactionId } = await processReservationDeposit(tx, {
              tenantId: session.tenantId!,
              cashRegisterId: caixa.id,
              reservationNumber: existing.reservationNumber,
              guestId: existing.guestId,
              roomNumber: room?.number || null,
              guestName: existing.guestName,
              amount: Number(pmt.amount),
              paymentMethodDescription: pmt.paymentMethod || "DINHEIRO",
              operatorId: opId,
              operatorName: opName,
            });
            await tx.reservation_payments.create({
              data: {
                id: crypto.randomUUID(),
                reservationId: id,
                tenantId: RESERVATION_TENANT_ID,
                cashRegisterId: caixa.id,
                cashTransactionId,
                amount: pmt.amount,
                paymentMethod: pmt.paymentMethod || "DINHEIRO",
                operatorId: opId,
                operatorName: opName,
              },
            });
          }
        }

        // depositPaid autoritativo = soma real dos adiantamentos que restaram.
        const agg = await tx.reservation_payments.aggregate({ where: { reservationId: id }, _sum: { amount: true } });
        await tx.reservation.update({ where: { id }, data: { depositPaid: Number(agg._sum.amount || 0) } });
      }

      if (status && realRoomId && ["CHECKED_IN", "CHECKEDIN", "OCCUPIED"].includes(String(status).toUpperCase())) {
        await tx.room.update({ where: { id: realRoomId }, data: { status: "OCCUPIED" } });
      }
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "RESERVATION_UPDATE",
      description: `${session?.name || "Usuário"} atualizou a reserva ${id}.`,
      entityType: "RESERVATION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Reserva ${id} atualizada e salva no banco de dados com sucesso!`,
    });
  } catch (error: any) {
    console.error("[PATCH /api/reservations] Erro:", error);
    const status = error instanceof ReservationConflictError ? 409 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

// DELETE /api/reservations — cancela uma reserva (restrito a administradores). Nunca apaga a
// linha do banco (soft-cancel, status = CANCELLED) — mesmo padrão do cancelamento feito pelo
// agente de IA (ver cancelReservationForAgent em apps/web/src/lib/aiAgent/tools.ts). Uma vez
// CANCELLED, a reserva já é tratada como "não bloqueia mais o quarto": findConflictingReservation
// (apps/web/src/lib/reservationHelpers.ts) filtra status CANCELLED/CHECKED_OUT ao checar
// overbooking, e o Mapa de Reservas (ReservationGridMap.tsx) já ignora CANCELLED tanto na exibição
// quanto na checagem local de sobreposição.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const result = await txWithRetry(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: { id, room: { tenantId: session!.tenantId! } },
        select: { id: true, guestId: true, reservationNumber: true },
      });
      if (!reservation) return { notFound: true as const };

      // Uma reserva cancelada não pode deixar o sinal preso no caixa nem um crédito fantasma no
      // saldo do hóspede.
      await reverseReservationDeposits(tx, {
        tenantId: session!.tenantId!,
        reservationId: id,
        reservationNumber: reservation.reservationNumber,
        guestId: reservation.guestId,
      });

      await tx.reservation.updateMany({
        where: { id, room: { tenantId: session!.tenantId! } },
        data: { status: "CANCELLED" },
      });
      return { notFound: false as const };
    });

    if (result.notFound) {
      return NextResponse.json({ success: false, error: `Reserva ${id} não encontrada.` }, { status: 404 });
    }

    await logActivity({
      tenantId: session!.tenantId,
      userId: session!.userId,
      userName: session!.name,
      action: "RESERVATION_CANCEL",
      description: `${session!.name} cancelou a reserva ${id}.`,
      entityType: "RESERVATION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Reserva ${id} cancelada com sucesso!`,
    });
  } catch (error: any) {
    console.error("[DELETE /api/reservations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
