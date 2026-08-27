import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { roomsStatusMapVersion, notModifiedResponse } from "@/lib/mapVersion";

// GET /api/reservations/rooms/status — versão enxuta de /api/reservations/rooms usada pelo
// polling de 3s do Mapa de Quartos. Traz só os campos que realmente mudam em tempo real (status,
// hóspede ativo, consumo, mensagens não lidas) — nunca dados completos de categoria/CPF/telefone/
// fotos, que só mudam via cadastro e já chegam pela carga inicial da tela via
// /api/reservations/rooms. Isso existe para conter o volume de saída de dados do banco: o
// endpoint completo tem include profundo (categoria inteira + hóspede inteiro) repetido a cada
// tick, o que gerava a maior parte do egress do Supabase durante os testes.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    // Resposta condicional (304) para o polling de 3 s do Mapa de Quartos — ver lib/mapVersion.ts.
    const etag = `"roomsst-${await roomsStatusMapVersion(session.tenantId)}"`;
    const notModified = notModifiedResponse(req, etag);
    if (notModified) return notModified;

    const rooms = await prisma.room.findMany({
      where: { tenantId: session.tenantId },
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

    // Reservas que chegam HOJE e ainda estão pendentes de check-in — usadas só para os selos
    // visuais de overbooking / "próximo check-in" nos cards do Mapa de Quartos. Consulta
    // deliberadamente enxuta (poucos campos, só o dia de hoje) para não pesar no polling de 3s:
    // um hotel tem no máximo algumas dezenas de chegadas por dia. Antes isso vinha de uma chamada
    // separada a /api/reservations, que baixava a lista inteira de 6 meses no carregamento da tela.
    //
    // "Hoje" é ancorado no fuso de Brasília (America/Sao_Paulo), não no fuso do processo — em
    // produção (Vercel) o servidor roda em UTC, então usar new Date() cru faria o "hoje" virar às
    // 21h no horário local. A janela é [meia-noite, meia-noite+1d) em UTC sobre a data-calendário
    // de Brasília, o que casa tanto com reservas gravadas como UTC-meia-noite quanto com as que
    // têm horário real (ex: 14:00 BRT gravado como 17:00Z).
    const todaySpStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const dayStart = new Date(`${todaySpStr}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const todayArrivals = await prisma.reservation.findMany({
      where: {
        room: { tenantId: session.tenantId },
        status: { notIn: ["CANCELLED", "CHECKED_IN", "CHECKED_OUT"] },
        checkInDate: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        guestName: true,
        reservationNumber: true,
        room: { select: { number: true } },
      },
      // Ordem estável: quando um quarto tem mais de uma reserva para hoje (overbooking), o card
      // mostra a primeira da lista — que deve ser a chegada mais cedo.
      orderBy: [{ checkInDate: "asc" }, { id: "asc" }],
    });

    const todayReservations = todayArrivals.map((r) => ({
      id: r.id,
      roomNumber: r.room.number,
      guestName: r.guestName || "Hóspede",
      reservationNumber: r.reservationNumber || r.id,
    }));

    return NextResponse.json(
      { success: true, rooms: formatted, todayReservations },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/reservations/rooms/status] Erro ao buscar status dos quartos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
