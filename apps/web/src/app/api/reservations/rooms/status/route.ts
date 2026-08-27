import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { roomsStatusMapVersion, notModifiedResponse } from "@/lib/mapVersion";
import { roomsStatusPayload } from "@/lib/mapQueries";

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

    // Montagem do payload em lib/mapQueries.ts, compartilhada com /api/mapa/quartos-tick e
    // /api/mapa/reservas-tick.
    const { rooms, todayReservations } = await roomsStatusPayload(session.tenantId);

    return NextResponse.json(
      { success: true, rooms, todayReservations },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/reservations/rooms/status] Erro ao buscar status dos quartos:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
