import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

// Consultas compartilhadas pelos pollings do Mapa de Quartos e do Mapa de Reservas.
//
// Cada função é a fonte única da verdade de um "pedaço" do payload; as rotas
// (/api/reservations, /api/reservations/rooms/status, /api/tenant/housekeeping-tasks) e as rotas
// consolidadas (/api/mapa/quartos-tick, /api/mapa/reservas-tick) todas chamam estas funções, para
// não duplicar (e deixar divergir) a lógica de isolamento por tenant e o formato de saída.

// Convenção histórica: toda Reservation vive sob este tenantId fixo; o isolamento real por hotel é
// sempre via Reservation.room.tenantId. Nunca usar o tenantId do cliente/sessão como valor deste
// campo (é só um rótulo devolvido no payload sintético, para compatibilidade com o front).
const RESERVATION_TENANT_ID = "TNT-01";

// Até quando o quarto está efetivamente ocupado, considerando diárias já lançadas na hospedagem
// (StayCheckin.dailiesCount, incrementado pelo rollover automático). Retorna o maior valor entre a
// data prevista de saída e checkInDate + dailiesCount — a barra do Mapa de Reservas acompanha
// extensões de estadia sem que a data prevista de saída em si seja alterada.
function occupiedUntilDate(
  expectedCheckOut: Date,
  stayCheckin: { checkInDate: Date; dailiesCount: number; isClosed: boolean } | null | undefined,
): Date {
  if (!stayCheckin || stayCheckin.isClosed) return expectedCheckOut;
  const billedThrough = new Date(stayCheckin.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stayCheckin.dailiesCount);
  return billedThrough > expectedCheckOut ? billedThrough : expectedCheckOut;
}

/**
 * Lista de reservas do Mapa de Reservas + hospedagens em aberto que não têm Reservation
 * correspondente (dessincronização histórica de dados). `select` explícito só dos campos que a
 * grade e a lista sintética desenham — trazer a linha inteira da Reservation a cada tick de 3 s
 * era boa parte do egress do Supabase nessa tela.
 */
export async function reservationsMapPayload(tenantId: string) {
  // Janela operacional: hoje até 6 meses à frente. Reservas já finalizadas só aparecem no
  // relatório dedicado. Exceção: status CHECKED_IN sempre aparece (hospedagem em andamento).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sixMonthsAhead = new Date(startOfToday);
  sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

  const reservations = await prisma.reservation.findMany({
    where: {
      room: { tenantId },
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
    occupiedUntilDate: occupiedUntilDate(r.checkOutDate, r.stayCheckin),
    // true quando o hóspede já preencheu o pré-check-in/FNRH (há ao menos um FNRHRecord) — distinto
    // de preCheckinSent, que só indica que o link foi disparado.
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

  // Hospedagens em aberto sem Reservation CHECKED_IN correspondente — deduplicado por QUARTO (em
  // dados legados o vínculo reservationId pode estar nulo mesmo havendo Reservation correta).
  const roomIdsAlreadyCheckedIn = new Set(
    formatted.filter((r) => r.status === "CHECKED_IN").map((r) => r.roomId),
  );

  const activeStays = await prisma.stayCheckin.findMany({
    where: { isClosed: false, tenantId },
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

  const syntheticFromStays = activeStays
    .filter((s) => !roomIdsAlreadyCheckedIn.has(s.roomId))
    .map((s) => ({
      id: `stay-${s.id}`,
      tenantId: RESERVATION_TENANT_ID,
      roomId: s.roomId,
      guestName: s.primaryGuest.fullName,
      guestCpf: s.primaryGuest.cpf,
      guestPhone: s.primaryGuest.phone,
      checkInDate: s.checkInDate,
      checkOutDate: s.expectedCheckOut,
      occupiedUntilDate: occupiedUntilDate(s.expectedCheckOut, {
        checkInDate: s.checkInDate,
        dailiesCount: s.dailiesCount,
        isClosed: s.isClosed,
      }),
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

  return [...formatted, ...syntheticFromStays];
}

/**
 * Estado enxuto dos quartos para o polling de 3 s do Mapa de Quartos (e da grade do Mapa de
 * Reservas): só o que muda em tempo real — status, hóspede ativo, consumo, mensagens não lidas — e
 * as chegadas do dia (selos de overbooking / "próximo check-in"). Nunca fotos, CPF, telefone nem
 * categoria completa: isso vem da carga inicial rica da tela via /api/reservations/rooms.
 */
export async function roomsStatusPayload(tenantId: string) {
  const rooms = await prisma.room.findMany({
    where: { tenantId },
    select: {
      id: true,
      number: true,
      floor: true,
      status: true,
      notes: true,
      active: true,
      category: { select: { name: true, dailyPrice: true } },
      checkins: {
        where: { isClosed: false },
        orderBy: { checkInDate: "desc" },
        take: 1,
        select: {
          primaryGuest: { select: { fullName: true } },
          expectedCheckOut: true,
          totalConsumption: true,
          _count: { select: { whatsappMessages: { where: { direction: "IN", read: false } } } },
        },
      },
    },
    orderBy: { number: "asc" },
  });

  const formatted = rooms.map((r) => {
    const activeStay = r.checkins[0];
    return {
      id: r.id,
      number: r.number,
      floor: r.floor || "Térreo",
      status: r.status,
      notes: r.notes || "",
      active: r.active,
      category: r.category.name,
      ratePerNight: Number(r.category.dailyPrice),
      activeStay: activeStay
        ? {
            guestName: activeStay.primaryGuest?.fullName || null,
            expectedCheckOut: activeStay.expectedCheckOut,
            totalConsumption: Number(activeStay.totalConsumption),
            unreadWhatsappCount: activeStay._count?.whatsappMessages ?? 0,
          }
        : null,
    };
  });

  // Chegadas de HOJE ainda pendentes de check-in — só para os selos visuais. "Hoje" ancorado no
  // fuso de Brasília (em produção o servidor roda em UTC): janela [meia-noite, meia-noite+1d) em
  // UTC sobre a data-calendário de Brasília, cobrindo tanto reservas gravadas como UTC-meia-noite
  // quanto as que têm horário real (ex: 14:00 BRT = 17:00Z).
  const todaySpStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dayStart = new Date(`${todaySpStr}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const todayArrivals = await prisma.reservation.findMany({
    where: {
      room: { tenantId },
      status: { notIn: ["CANCELLED", "CHECKED_IN", "CHECKED_OUT"] },
      checkInDate: { gte: dayStart, lt: dayEnd },
    },
    select: {
      id: true,
      guestName: true,
      reservationNumber: true,
      room: { select: { number: true } },
    },
    orderBy: [{ checkInDate: "asc" }, { id: "asc" }],
  });

  const todayReservations = todayArrivals.map((r) => ({
    id: r.id,
    roomNumber: r.room.number,
    guestName: r.guestName || "Hóspede",
    reservationNumber: r.reservationNumber || r.id,
  }));

  return { rooms: formatted, todayReservations };
}

/**
 * Tarefas de limpeza em aberto (selo "em limpeza" nos mapas + tela de atribuição da Governança) e
 * os quartos marcados como "não perturbe" hoje. Exclui a arrumação diária automática do modo QUEUE
 * ainda sem governanta, que não é uma atribuição de verdade.
 */
export async function housekeepingTasksPayload(tenantId: string) {
  const today = dateOnlyBrasilia(new Date());

  const [tasks, dndToday] = await Promise.all([
    prisma.housekeepingTask.findMany({
      where: {
        tenantId,
        OR: [
          { status: "IN_PROGRESS" },
          { status: "PENDING", housekeeperId: { not: null } },
          { status: "PENDING", serviceDate: null },
        ],
      },
      include: {
        housekeeper: { select: { id: true, name: true, photoUrl: true } },
        room: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.housekeepingTask.findMany({
      where: {
        tenantId,
        type: "OCCUPIED",
        status: "SKIPPED",
        skipReason: "DO_NOT_DISTURB",
        serviceDate: today,
      },
      select: { roomId: true },
    }),
  ]);

  return { tasks, dndTodayRoomIds: dndToday.map((t) => t.roomId) };
}
