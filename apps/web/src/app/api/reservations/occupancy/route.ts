import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// Quartos nesses status contam como "ocupados" — mesma definição usada no Mapa de
// Quartos (ver counts.OCCUPIED em apps/web/src/app/app/page.tsx) e no worker de snapshot.
const OCCUPIED_STATUSES = ["OCCUPIED", "OCCUPIED_CLEANING"];

// GET /api/reservations/occupancy?tenantId=...&hours=24
// Retorna a taxa de ocupação atual (calculada em tempo real) e, opcionalmente, o
// histórico de snapshots gravados de hora em hora (ver apps/worker/src/occupancySnapshot.ts)
// para as últimas N horas (padrão 24), usado nas estatísticas de vacância do hotel.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;
    const hours = Math.min(Math.max(Number(searchParams.get("hours")) || 24, 1), 24 * 30);

    const rooms = await prisma.room.findMany({
      where: { tenantId, active: true },
      select: { status: true },
    });

    const occupiedRooms = rooms.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length;
    const totalRooms = rooms.length;
    const occupancyRate = totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(2)) : 0;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const history = await prisma.roomOccupancySnapshot.findMany({
      where: { tenantId, snapshotAt: { gte: since } },
      orderBy: { snapshotAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      current: { totalRooms, occupiedRooms, occupancyRate },
      history: history.map((h) => ({
        snapshotAt: h.snapshotAt,
        totalRooms: h.totalRooms,
        occupiedRooms: h.occupiedRooms,
        occupancyRate: Number(h.occupancyRate),
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/reservations/occupancy] Erro ao buscar taxa de ocupação:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
