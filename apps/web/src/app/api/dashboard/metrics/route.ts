import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// Quartos nesses status contam como "ocupados" — mesma definição usada no Mapa de
// Quartos e no worker de snapshot (ver apps/worker/src/occupancySnapshot.ts).
const OCCUPIED_STATUSES = ["OCCUPIED", "OCCUPIED_CLEANING"];

function brDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// GET /api/dashboard/metrics — métricas operacionais (não financeiras) para o Dashboard:
// ocupação atual, chegadas/saídas do dia, série de ocupação x vacância dos últimos 15
// dias (a partir dos snapshots horários) e o ranking de quartos mais/menos ocupados
// nos últimos 30 dias.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;

    const todayBr = dateOnlyBrasilia(new Date());
    const tomorrowBr = new Date(todayBr.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const rooms = await prisma.room.findMany({
      where: { tenantId, active: true },
      select: { id: true, number: true, floor: true, status: true },
    });

    const totalRooms = rooms.length;
    const occupiedNow = rooms.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length;
    const pendingCleaning = rooms.filter((r) => r.status === "VACANT_DIRTY").length;
    const occupancyRateNow = totalRooms > 0 ? Number(((occupiedNow / totalRooms) * 100).toFixed(1)) : 0;

    const [checkinsHoje, checkoutsHoje] = await Promise.all([
      prisma.stayCheckin.count({
        where: { tenantId, checkInDate: { gte: todayBr, lt: tomorrowBr } },
      }),
      prisma.stayCheckin.count({
        where: { tenantId, actualCheckOut: { gte: todayBr, lt: tomorrowBr } },
      }),
    ]);

    // Permanência média (últimos 90 dias de hospedagens encerradas)
    const ninetyDaysAgo = new Date(todayBr.getTime() - 90 * 24 * 60 * 60 * 1000);
    const closedStays = await prisma.stayCheckin.findMany({
      where: { tenantId, isClosed: true, actualCheckOut: { gte: ninetyDaysAgo } },
      select: { checkInDate: true, actualCheckOut: true, dailiesCount: true },
    });
    const nightsPerStay = closedStays.map((s) => {
      if (s.dailiesCount && s.dailiesCount > 0) return s.dailiesCount;
      const diff = s.actualCheckOut ? (s.actualCheckOut.getTime() - s.checkInDate.getTime()) / 86400000 : 0;
      return Math.max(1, Math.round(diff));
    });
    const permanenciaMedia =
      nightsPerStay.length > 0
        ? Number((nightsPerStay.reduce((a, b) => a + b, 0) / nightsPerStay.length).toFixed(1))
        : 0;

    // Hóspedes recorrentes: entre quem se hospedou nos últimos 90 dias, qual % já havia
    // se hospedado antes (mais de uma estadia no histórico total).
    const recentGuests = await prisma.stayCheckin.findMany({
      where: { tenantId, checkInDate: { gte: ninetyDaysAgo } },
      select: { primaryGuestId: true },
      distinct: ["primaryGuestId"],
    });
    const recentGuestIds = recentGuests.map((g) => g.primaryGuestId);
    let recorrentes = 0;
    if (recentGuestIds.length > 0) {
      const totals = await prisma.stayCheckin.groupBy({
        by: ["primaryGuestId"],
        where: { tenantId, primaryGuestId: { in: recentGuestIds } },
        _count: { _all: true },
      });
      recorrentes = totals.filter((t) => t._count._all > 1).length;
    }
    const totalHospedesPeriodo = recentGuestIds.length;
    const taxaRecorrencia =
      totalHospedesPeriodo > 0 ? Number(((recorrentes / totalHospedesPeriodo) * 100).toFixed(1)) : 0;

    // Série de ocupação x vacância dos últimos 15 dias, a partir dos snapshots horários.
    const fifteenDaysAgo = new Date(todayBr.getTime() - 14 * 24 * 60 * 60 * 1000);
    const snapshots = await prisma.roomOccupancySnapshot.findMany({
      where: { tenantId, snapshotAt: { gte: fifteenDaysAgo } },
      select: { snapshotAt: true, occupancyRate: true },
    });
    const byDay = new Map<string, number[]>();
    for (const s of snapshots) {
      const key = brDateKey(s.snapshotAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(Number(s.occupancyRate));
    }
    const serie15Dias = [];
    for (let i = 14; i >= 0; i--) {
      const day = new Date(todayBr.getTime() - i * 24 * 60 * 60 * 1000);
      const key = brDateKey(day);
      const values = byDay.get(key);
      const ocupacao =
        values && values.length > 0 ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : null;
      const vacancia = ocupacao !== null ? Number((100 - ocupacao).toFixed(1)) : null;
      serie15Dias.push({
        date: key,
        label: day.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }),
        ocupacao,
        vacancia,
      });
    }

    // Ranking de quartos mais/menos ocupados nos últimos 30 dias (noites ocupadas,
    // considerando a sobreposição de cada hospedagem com a janela e sem contar noites futuras).
    const windowDays = 30;
    const windowStart = new Date(todayBr.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
    const windowEnd = tomorrowBr;
    const activeRoomIds = rooms.map((r) => r.id);
    const overlappingStays =
      activeRoomIds.length > 0
        ? await prisma.stayCheckin.findMany({
            where: {
              tenantId,
              roomId: { in: activeRoomIds },
              checkInDate: { lt: windowEnd },
              OR: [{ actualCheckOut: null }, { actualCheckOut: { gt: windowStart } }],
            },
            select: { roomId: true, checkInDate: true, actualCheckOut: true },
          })
        : [];
    const nightsByRoom = new Map<string, number>();
    for (const stay of overlappingStays) {
      const effectiveEnd = stay.actualCheckOut ?? now;
      const clippedEndMs = Math.min(effectiveEnd.getTime(), windowEnd.getTime(), now.getTime());
      const clippedStartMs = Math.max(stay.checkInDate.getTime(), windowStart.getTime());
      const nights = Math.max(0, (clippedEndMs - clippedStartMs) / 86400000);
      nightsByRoom.set(stay.roomId, (nightsByRoom.get(stay.roomId) || 0) + nights);
    }
    const roomStats = rooms.map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor || "-",
      noites: Number((nightsByRoom.get(r.id) || 0).toFixed(1)),
    }));
    const maisOcupados = [...roomStats].sort((a, b) => b.noites - a.noites).slice(0, 5);
    const menosOcupados = [...roomStats].sort((a, b) => a.noites - b.noites).slice(0, 5);

    return NextResponse.json({
      success: true,
      ocupacaoAtual: { ocupados: occupiedNow, total: totalRooms, taxa: occupancyRateNow },
      checkinsHoje,
      checkoutsHoje,
      quartosLimpezaPendente: pendingCleaning,
      permanenciaMedia,
      recorrencia: { taxa: taxaRecorrencia, recorrentes, totalHospedesPeriodo },
      serie15Dias,
      maisOcupados,
      menosOcupados,
    });
  } catch (error: any) {
    console.error("[GET /api/dashboard/metrics] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
