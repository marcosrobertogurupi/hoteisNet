import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/relatorios/quartos-limpeza — quartos vagos pendentes de higienização (VACANT_DIRTY),
// agrupáveis por andar no front.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;

    const rooms = await prisma.room.findMany({
      where: { tenantId, status: "VACANT_DIRTY", active: true },
      include: { category: true },
    });

    const rows = rooms
      .map((r) => ({
        id: r.id,
        number: r.number,
        floor: r.floor && r.floor.trim() ? r.floor : "Sem andar definido",
        description: r.category?.description || r.category?.name || "",
      }))
      .sort(
        (a, b) =>
          a.floor.localeCompare(b.floor, undefined, { numeric: true }) ||
          a.number.localeCompare(b.number, undefined, { numeric: true })
      );

    const hotel = await getTenantHeaderInfo(tenantId);

    return NextResponse.json({ success: true, hotel, rooms: rows, total: rows.length });
  } catch (error: any) {
    console.error("[GET /api/relatorios/quartos-limpeza] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
