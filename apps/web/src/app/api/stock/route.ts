import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/stock — quadro de estoque para a tela "Estoque Multi-PDV". Traz o estoque geral
// (almoxarifado) de cada produto e o saldo fracionado real (POSProductStock) por PDV, num
// mapa { posLocationId: saldo }. Endpoint de polling: `select` enxuto, sem a linha inteira do
// produto e sem os campos que a tela não desenha (ver regras de egress no CLAUDE.md).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const rows = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        // Classificação vem do grupo cadastrado; `category` (texto livre) só como fallback
        // para produtos antigos ainda sem grupo — ver /app/cadastros/produtos.
        category: true,
        group: { select: { name: true } },
        generalStock: true,
        minStock: true,
        costPrice: true,
        salePrice: true,
        posStocks: { select: { posLocationId: true, currentStock: true } },
      },
    });

    const products = rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.group?.name ?? p.category ?? "",
      generalStock: p.generalStock,
      minStock: p.minStock,
      costPrice: Number(p.costPrice),
      salePrice: Number(p.salePrice),
      posStocks: p.posStocks.reduce<Record<string, number>>((acc, s) => {
        acc[s.posLocationId] = s.currentStock;
        return acc;
      }, {}),
    }));

    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
