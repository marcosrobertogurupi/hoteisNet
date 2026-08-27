import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { resolveRoomId, findConflictingReservation } from "@/lib/reservationHelpers";
import { reservationsMapVersion, notModifiedResponse } from "@/lib/mapVersion";

// Erro dedicado para conflito de overbooking (quarto já reservado no período) — permite ao catch
// de cada handler devolver 409 especificamente para esse caso, distinto de um erro genérico (500).
class ReservationConflictError extends Error {}

// Calcula até quando o quarto está efetivamente ocupado, com base nas diárias já lançadas na
// hospedagem (StayCheckin.dailiesCount, incrementado pelo rollover automático de diária). Retorna
// o maior valor entre a data prevista de saída e checkInDate + dailiesCount, para que a barra do
// Mapa de Reservas acompanhe extensões de estadia sem alterar a data prevista de saída em si.
function occupiedUntilDate(
  expectedCheckOut: Date,
  stayCheckin: { checkInDate: Date; dailiesCount: number; isClosed: boolean } | null | undefined
): Date {
  if (!stayCheckin || stayCheckin.isClosed) return expectedCheckOut;
  const billedThrough = new Date(stayCheckin.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stayCheckin.dailiesCount);
  return billedThrough > expectedCheckOut ? billedThrough : expectedCheckOut;
}

// Toda Reservation vive sob este tenantId fixo por convenção histórica deste projeto — o
// isolamento real por hotel é sempre via Reservation.room.tenantId (ver comentário em
// lib/preCheckinSender.ts). Nunca usar o tenantId do cliente/sessão como valor deste campo.
const RESERVATION_TENANT_ID = "TNT-01";

// GET /api/reservations — lista reservas do tenant da sessão
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

    // Mapa de Reservas só precisa do horizonte operacional: hoje até 6 meses à frente. Reservas já
    // finalizadas (passado) nunca aparecem aqui — só no relatório dedicado — o que evita que a
    // resposta cresça sem limite conforme o hotel acumula histórico. A exceção é status CHECKED_IN:
    // uma hospedagem em andamento continua aparecendo mesmo que o checkOutDate original (antes de
    // diárias extras por checkout atrasado) já tenha passado.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sixMonthsAhead = new Date(startOfToday);
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

    // `select` explícito (em vez de `include` + spread `...r`): o Mapa de Reservas e a lista só
    // desenham este subconjunto de campos, e a resposta é baixada a cada 3 s pelo polling. Trazer
    // a linha inteira da Reservation (notes, roomDescription, operatorName, discountAmount, flags
    // de WhatsApp, etc.) a cada tick era boa parte do egress do Supabase nessa tela.
    const reservations = await prisma.reservation.findMany({
      where: {
        room: { tenantId: session.tenantId },
        OR: [
          { status: "CHECKED_IN" },
          { checkOutDate: { gte: startOfToday }, checkInDate: { lte: sixMonthsAhead } },
        ],
      },
      select: {
        id: true,
        roomId: true,
        status: true,
        checkInDate: true,
        checkOutDate: true,
        guestName: true,
        guestPhone: true,
        guestCpf: true,
        dailyRate: true,
        depositPaid: true,
        totalAmount: true,
        tariffName: true,
        notes: true,
        roomDescription: true,
        reservationNumber: true,
        preCheckinSent: true,
        room: {
          select: {
            id: true,
            number: true,
            floor: true,
            status: true,
            category: { select: { name: true, description: true } },
          },
        },
        stayCheckin: { select: { checkInDate: true, dailiesCount: true, isClosed: true } },
        _count: { select: { fnrhRecords: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = reservations.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      status: r.status,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCpf: r.guestCpf,
      dailyRate: r.dailyRate,
      depositPaid: r.depositPaid,
      totalAmount: r.totalAmount,
      tariffName: r.tariffName,
      notes: r.notes,
      roomDescription: r.roomDescription,
      reservationNumber: r.reservationNumber,
      preCheckinSent: r.preCheckinSent,
      // Data até onde o quarto está efetivamente ocupado, considerando diárias extras já
      // lançadas na hospedagem (ex: rollover automático) que estenderam a estadia além da
      // "Dt.Prev.Saída" original. Usado só para a barra visual do Mapa de Reservas — a data
      // prevista de saída (checkOutDate) do hóspede não é alterada por isso.
      occupiedUntilDate: occupiedUntilDate(r.checkOutDate, r.stayCheckin),
      // true quando o hóspede já preencheu o pré-check-in/FNRH pelo link (existe ao menos um
      // FNRHRecord vinculado a esta reserva) — distinto de preCheckinSent, que só indica que o
      // link foi disparado.
      fnrhCompleted: r._count.fnrhRecords > 0,
      rooms: r.room
        ? {
            id: r.room.id,
            floor: r.room.floor,
            number: r.room.number,
            status: r.room.status,
            room_categories: r.room.category
              ? { name: r.room.category.name, description: r.room.category.description || r.room.category.name }
              : null,
          }
        : null,
    }));

    // Toda hospedagem em aberto (StayCheckin com isClosed: false) precisa aparecer no Mapa de
    // Reservas como "vigente", mesmo que — por dessincronização histórica de dados (ex: check-in
    // feito antes do vínculo reservationId existir, ou uma Reservation que caiu para CHECKED_OUT
    // por engano) — não haja uma Reservation com status CHECKED_IN correspondente. Sem isso, o
    // operador pode achar um quarto "livre" no mapa de reservas enquanto ele está, na prática,
    // ocupado — o mesmo dado que o Mapa de Quartos já mostra corretamente.
    // Deduplicar por QUARTO, não pelo vínculo reservationId — em dados legados esse vínculo pode
    // estar nulo mesmo quando já existe uma Reservation CHECKED_IN correta para o quarto, e o que
    // importa aqui é nunca mostrar o mesmo quarto duas vezes no mapa.
    const roomIdsAlreadyCheckedIn = new Set(
      formatted.filter((r) => r.status === "CHECKED_IN").map((r) => r.roomId)
    );

    const activeStays = await prisma.stayCheckin.findMany({
      where: { isClosed: false, tenantId: session.tenantId },
      select: {
        id: true,
        roomId: true,
        checkInDate: true,
        expectedCheckOut: true,
        dailiesCount: true,
        isClosed: true,
        totalDaily: true,
        primaryGuest: { select: { fullName: true, cpf: true, phone: true } },
        room: {
          select: {
            id: true,
            number: true,
            floor: true,
            status: true,
            category: { select: { name: true, description: true } },
          },
        },
      },
    });

    const unlinkedStays = activeStays.filter((s) => !roomIdsAlreadyCheckedIn.has(s.roomId));

    const syntheticFromStays = unlinkedStays.map((s) => ({
      id: `stay-${s.id}`,
      tenantId: RESERVATION_TENANT_ID,
      roomId: s.roomId,
      guestName: s.primaryGuest.fullName,
      guestCpf: s.primaryGuest.cpf,
      guestPhone: s.primaryGuest.phone,
      checkInDate: s.checkInDate,
      checkOutDate: s.expectedCheckOut,
      occupiedUntilDate: occupiedUntilDate(s.expectedCheckOut, { checkInDate: s.checkInDate, dailiesCount: s.dailiesCount, isClosed: s.isClosed }),
      totalAmount: s.totalDaily,
      depositPaid: 0,
      status: "CHECKED_IN" as const,
      preCheckinSent: false,
      fnrhCompleted: false,
      notes: null,
      reservationNumber: null,
      tariffName: s.room.category?.name || null,
      rooms: {
        id: s.room.id,
        floor: s.room.floor,
        number: s.room.number,
        status: s.room.status,
        room_categories: s.room.category
          ? { name: s.room.category.name, description: s.room.category.description || s.room.category.name }
          : null,
      },
    }));

    return NextResponse.json(
      { success: true, reservations: [...formatted, ...syntheticFromStays] },
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
      cashRegisterId,
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

    const result = await prisma.$transaction(async (tx) => {
      const realRoomId = await resolveRoomId(tx as any, String(roomId), session.tenantId!);
      const checkIn = new Date(checkInDate);
      const checkOut = new Date(checkOutDate);

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

      // cashRegisterId, se informado, também precisa ser um caixa do mesmo tenant — senão o
      // adiantamento seria lançado no caixa de outro hotel.
      let realCashRegisterId: string | null = null;
      if (cashRegisterId) {
        const caixa = await tx.cashRegister.findFirst({ where: { id: cashRegisterId, tenantId: session.tenantId! }, select: { id: true } });
        realCashRegisterId = caixa?.id || null;
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

      const validPayments = (payments as any[]).filter((p) => p.amount && p.amount > 0);
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
              description: `Adiantamento Reserva ${reservationNumber} - ${guestName}`,
              paymentMethod: pmt.paymentMethod || "DINHEIRO",
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
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
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
      if (depositPaid !== undefined) data.depositPaid = depositPaid;
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

    const updated = await prisma.reservation.updateMany({
      where: { id, room: { tenantId: session!.tenantId } },
      data: { status: "CANCELLED" },
    });

    if (updated.count === 0) {
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
