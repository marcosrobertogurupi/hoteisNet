import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

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

// GET /api/reservations — lista reservas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "TNT-01";

    const reservations = await prisma.reservation.findMany({
      where: { tenantId },
      include: {
        room: {
          include: { category: true },
        },
        stayCheckin: { select: { checkInDate: true, dailiesCount: true, isClosed: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = reservations.map((r) => ({
      ...r,
      // Data até onde o quarto está efetivamente ocupado, considerando diárias extras já
      // lançadas na hospedagem (ex: rollover automático) que estenderam a estadia além da
      // "Dt.Prev.Saída" original. Usado só para a barra visual do Mapa de Reservas — a data
      // prevista de saída (checkOutDate) do hóspede não é alterada por isso.
      occupiedUntilDate: occupiedUntilDate(r.checkOutDate, r.stayCheckin),
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
      room: undefined,
      stayCheckin: undefined,
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
      where: { isClosed: false },
      include: { room: { include: { category: true } }, primaryGuest: true },
    });

    const unlinkedStays = activeStays.filter((s) => !roomIdsAlreadyCheckedIn.has(s.roomId));

    const syntheticFromStays = unlinkedStays.map((s) => ({
      id: `stay-${s.id}`,
      tenantId,
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

    return NextResponse.json({ success: true, reservations: [...formatted, ...syntheticFromStays] });
  } catch (error: any) {
    console.error("[GET /api/reservations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message });
  }
}

// Resolve o UUID real do quarto a partir de um id ou número; cria o quarto se não existir.
async function resolveRoomId(tx: typeof prisma, roomIdOrNumber: string, tenantId: string): Promise<string> {
  const room = await tx.room.findFirst({
    where: { OR: [{ id: roomIdOrNumber }, { number: roomIdOrNumber }] },
  });
  if (room) return room.id;

  const category = await tx.roomCategory.findFirst({ where: { tenantId } });
  const created = await tx.room.create({
    data: {
      number: String(roomIdOrNumber),
      floor: "1",
      status: "VACANT_CLEAN",
      tenantId,
      categoryId: category?.id || (await tx.roomCategory.create({ data: { tenantId, name: "STANDARD", dailyPrice: 0, capacity: 2 } })).id,
    },
  });
  return created.id;
}

// POST /api/reservations — cria uma nova reserva
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId = "TNT-01",
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
      const realRoomId = await resolveRoomId(tx as any, String(roomId), tenantId);
      const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));
      const finalTotal = totalAmount || totalDiarias || 0;

      const reservation = await tx.reservation.create({
        data: {
          tenantId,
          roomId: realRoomId,
          guestName,
          guestCpf: guestCpf || null,
          guestPhone: guestPhone || null,
          guestId: guestId || null,
          checkInDate: new Date(checkInDate),
          checkOutDate: new Date(checkOutDate),
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
          cashRegisterId: cashRegisterId || null,
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
            tenantId,
            cashRegisterId: cashRegisterId || null,
            amount: pmt.amount,
            paymentMethod: pmt.paymentMethod || "DINHEIRO",
            operatorName: operatorName || null,
          },
        });

        if (cashRegisterId) {
          await tx.cashTransaction.create({
            data: {
              cashRegisterId,
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

    const session = await getSessionUser(req);
    await logActivity({
      tenantId,
      userId: session?.userId,
      userName: session?.name,
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
    return NextResponse.json({ success: false, error: error.message || "Erro interno ao salvar reserva." });
  }
}

// PATCH /api/reservations — atualiza/move uma reserva existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      tenantId = "TNT-01",
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
      const realRoomId = roomId ? await resolveRoomId(tx as any, String(roomId), tenantId) : undefined;

      const data: Record<string, unknown> = {};
      if (realRoomId !== undefined) data.roomId = realRoomId;
      if (checkInDate) data.checkInDate = new Date(checkInDate);
      if (checkOutDate) data.checkOutDate = new Date(checkOutDate);
      if (guestName) data.guestName = guestName;
      if (guestCpf !== undefined) data.guestCpf = guestCpf;
      if (guestPhone !== undefined) data.guestPhone = guestPhone;
      if (dailyRate !== undefined) data.dailyRate = dailyRate;
      if (depositPaid !== undefined) data.depositPaid = depositPaid;
      if (totalAmount !== undefined) data.totalAmount = totalAmount;
      if (notes !== undefined) data.notes = notes;
      if (status) data.status = status;

      const updated = await tx.reservation.updateMany({
        where: { id, tenantId },
        data,
      });

      if (updated.count === 0) {
        throw new Error(`Reserva ${id} não encontrada.`);
      }

      if (status && realRoomId && ["CHECKED_IN", "CHECKEDIN", "OCCUPIED"].includes(String(status).toUpperCase())) {
        await tx.room.update({ where: { id: realRoomId }, data: { status: "OCCUPIED" } });
      }
    });

    const session = await getSessionUser(req);
    await logActivity({
      tenantId,
      userId: session?.userId,
      userName: session?.name,
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/reservations — exclui/cancela uma reserva (restrito a administradores)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const tenantId = searchParams.get("tenantId") || "TNT-01";

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }

    await prisma.reservation.deleteMany({ where: { id, tenantId } });

    await logActivity({
      tenantId,
      userId: session!.userId,
      userName: session!.name,
      action: "RESERVATION_DELETE",
      description: `${session!.name} excluiu a reserva ${id}.`,
      entityType: "RESERVATION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Reserva ${id} removida com sucesso!`,
    });
  } catch (error: any) {
    console.error("[DELETE /api/reservations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
