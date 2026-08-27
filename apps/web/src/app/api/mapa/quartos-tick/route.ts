import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  roomsStatusMapVersion,
  housekeepingTasksVersion,
  combineVersions,
  notModifiedResponse,
} from "@/lib/mapVersion";
import { roomsStatusPayload, housekeepingTasksPayload } from "@/lib/mapQueries";

// GET /api/mapa/quartos-tick — uma única requisição por tick do polling de 3 s do Mapa de Quartos,
// no lugar das duas que a tela fazia (/api/reservations/rooms/status + /api/tenant/housekeeping-
// tasks). Menos conexões abertas no pooler do Supabase por tick. Mesmo mecanismo de ETag/304: o
// carimbo combina as versões dos dois pedaços, então um 304 aqui garante que NADA que o mapa
// desenha mudou. Ver lib/mapVersion.ts e lib/mapQueries.ts.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const [roomsV, hkV] = await Promise.all([
      roomsStatusMapVersion(tenantId),
      housekeepingTasksVersion(tenantId),
    ]);
    const etag = `"quartos-${combineVersions(roomsV, hkV)}"`;
    const notModified = notModifiedResponse(req, etag);
    if (notModified) return notModified;

    const [{ rooms, todayReservations }, { tasks, dndTodayRoomIds }] = await Promise.all([
      roomsStatusPayload(tenantId),
      housekeepingTasksPayload(tenantId),
    ]);

    return NextResponse.json(
      { success: true, rooms, todayReservations, housekeepingTasks: tasks, dndTodayRoomIds },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/mapa/quartos-tick] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
