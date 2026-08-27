import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  reservationsMapVersion,
  roomsStatusMapVersion,
  housekeepingTasksVersion,
  combineVersions,
  notModifiedResponse,
} from "@/lib/mapVersion";
import {
  reservationsMapPayload,
  roomsStatusPayload,
  housekeepingTasksPayload,
} from "@/lib/mapQueries";

// GET /api/mapa/reservas-tick — uma única requisição por tick do polling de 3 s do Mapa de
// Reservas, no lugar das três que a tela fazia (a página buscava /api/reservations e o
// ReservationGridMap buscava, por conta própria, /api/reservations/rooms/status e
// /api/tenant/housekeeping-tasks). Menos conexões no pooler do Supabase por tick. ETag combina as
// três versões — um 304 garante que nada da grade mudou. Ver lib/mapVersion.ts / lib/mapQueries.ts.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const [resvV, roomsV, hkV] = await Promise.all([
      reservationsMapVersion(tenantId),
      roomsStatusMapVersion(tenantId),
      housekeepingTasksVersion(tenantId),
    ]);
    const etag = `"reservas-${combineVersions(resvV, roomsV, hkV)}"`;
    const notModified = notModifiedResponse(req, etag);
    if (notModified) return notModified;

    const [reservations, { rooms: gridRooms }, { tasks }] = await Promise.all([
      reservationsMapPayload(tenantId),
      roomsStatusPayload(tenantId),
      housekeepingTasksPayload(tenantId),
    ]);

    return NextResponse.json(
      { success: true, reservations, gridRooms, housekeepingTasks: tasks },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/mapa/reservas-tick] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
