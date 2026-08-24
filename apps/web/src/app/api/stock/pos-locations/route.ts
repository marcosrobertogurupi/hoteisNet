import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// Nomes dos PDVs de destino da baixa de estoque no lançamento de consumo do quarto,
// espelhando o popup "P.D.V." (Restaurante / Bar Recepção / Frigobar) do sistema WinDev original.
const DEFAULT_POS_NAMES = ["RESTAURANTE", "BAR RECEPCAO", "FRIGOBAR"];

// GET /api/stock/pos-locations — lista os Pontos de Venda (PDVs) do tenant, criando os 3
// pontos padrão na primeira chamada caso o tenant ainda não os possua cadastrados.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    let posLocations = await prisma.pOSLocation.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    if (posLocations.length === 0) {
      await prisma.pOSLocation.createMany({
        data: DEFAULT_POS_NAMES.map((name) => ({ tenantId, name, isCentral: name === "RESTAURANTE" })),
      });
      posLocations = await prisma.pOSLocation.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json({ success: true, posLocations });
  } catch (error: any) {
    console.error("[GET /api/stock/pos-locations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar PDVs." }, { status: 500 });
  }
}
