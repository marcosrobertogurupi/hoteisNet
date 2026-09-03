import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

// GET /api/stock-count/targets — alvos de contagem que o colaborador pode escolher no celular:
// cada PDV ativo do hotel e o "Estoque geral / almoxarifado". Para cada alvo, informa se já existe
// uma contagem em andamento (OPEN) para retomar. `select` enxuto (regras de egress no CLAUDE.md).
export async function GET(req: NextRequest) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const [posLocations, openCounts] = await Promise.all([
      prisma.pOSLocation.findMany({
        where: { tenantId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, location: true },
      }),
      prisma.stockCount.findMany({
        where: { tenantId, status: "OPEN" },
        select: { id: true, posLocationId: true },
      }),
    ]);

    const openByPos = new Map<string | null, string>();
    for (const c of openCounts) openByPos.set(c.posLocationId, c.id);

    return NextResponse.json({
      success: true,
      generalOpenCountId: openByPos.get(null) ?? null,
      posLocations: posLocations.map((p) => ({
        id: p.id,
        name: p.name,
        location: p.location,
        openCountId: openByPos.get(p.id) ?? null,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/stock-count/targets] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}
