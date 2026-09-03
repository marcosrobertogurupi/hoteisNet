import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

// GET /api/relatorios/conferencia-estoque
// Folha de conferência de estoque dos PDV: para cada PDV, lista os produtos alocados nele e o
// saldo atual do sistema (POSProductStock), com espaço para o funcionário anotar a contagem
// física. O assinante escolhe um PDV específico ou "geral" (todos os PDV ativos).
// Query: posLocationId (opcional) — sem ele, sai o relatório geral.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const { searchParams } = new URL(req.url);
    const posLocationId = searchParams.get("posLocationId");

    // PDVs do relatório — o pedido (posLocationId) é validado contra o tenant.
    const posLocations = await prisma.pOSLocation.findMany({
      where: {
        tenantId,
        active: true,
        ...(posLocationId ? { id: posLocationId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, location: true },
    });

    if (posLocations.length === 0) {
      return NextResponse.json(
        { success: false, error: posLocationId ? "PDV não encontrado." : "Nenhum PDV ativo cadastrado." },
        { status: 404 }
      );
    }

    const posIds = posLocations.map((p) => p.id);

    // Produtos do tenant com o saldo em cada um dos PDV do relatório. `select` enxuto — só o que a
    // folha desenha (ver regras de egress no CLAUDE.md).
    const products = await prisma.product.findMany({
      where: { tenantId, posStocks: { some: { posLocationId: { in: posIds } } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        barcode: true,
        minStock: true,
        posStocks: {
          where: { posLocationId: { in: posIds } },
          select: { posLocationId: true, currentStock: true },
        },
      },
    });

    const grupos = posLocations.map((pos) => {
      const itens = products
        .map((p) => {
          const row = p.posStocks.find((s) => s.posLocationId === pos.id);
          if (!row) return null; // produto não alocado neste PDV
          return {
            id: p.id,
            nome: p.name,
            categoria: p.category || "—",
            codigoBarras: p.barcode || "",
            estoqueSistema: row.currentStock,
            minimo: p.minStock,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return {
        pdvId: pos.id,
        pdv: pos.name,
        local: pos.location || null,
        itens,
        totalItens: itens.length,
        totalUnidades: itens.reduce((s, i) => s + i.estoqueSistema, 0),
      };
    });

    const hotel = await getTenantHeaderInfo(tenantId);

    return NextResponse.json({
      success: true,
      hotel,
      escopo: posLocationId ? "PDV" : "GERAL",
      grupos,
    });
  } catch (error: any) {
    console.error("[GET /api/relatorios/conferencia-estoque] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
