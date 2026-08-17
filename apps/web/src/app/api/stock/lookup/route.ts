import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";
const MAX_RESULTS = 15;

// GET /api/stock/lookup?code=... — resolve produtos pelo código de barras, código interno ou nome
// (contém, sem diferenciar maiúsculas/minúsculas) digitado no campo "Cod/Cod.Barras" da tela de
// Lançamento de Consumo do Quarto. Devolve uma lista (para o filtro em tempo real enquanto o
// operador digita) com correspondências exatas de código primeiro, e o campo "product" com o
// melhor resultado para manter compatibilidade com o fluxo de leitor de código de barras (Enter).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;
    const code = (searchParams.get("code") || "").trim();

    if (!code) {
      return NextResponse.json({ success: false, error: "Informe o código, código de barras ou nome." }, { status: 400 });
    }

    const tenantFilter = { tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"] } };

    // Um produto pode ter vários códigos de barras vinculados (tabela product_barcodes) — qualquer
    // um deles resolve para o mesmo produto, além do campo legado "barcode" e do id exato.
    const exactMatches = await prisma.product.findMany({
      where: { ...tenantFilter, OR: [{ barcode: code }, { id: code }, { barcodes: { some: { code } } }] },
      take: MAX_RESULTS,
    });

    const partialMatches = await prisma.product.findMany({
      where: { ...tenantFilter, name: { contains: code, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
    });

    const seen = new Set<string>();
    const products = [...exactMatches, ...partialMatches].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, MAX_RESULTS);

    if (products.length === 0) {
      return NextResponse.json({ success: false, error: `Nenhum produto encontrado para "${code}".` }, { status: 404 });
    }

    return NextResponse.json({ success: true, products, product: products[0] });
  } catch (error: any) {
    console.error("[GET /api/stock/lookup] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar produto." }, { status: 500 });
  }
}
