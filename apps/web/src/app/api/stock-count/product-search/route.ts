import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

const MAX_RESULTS = 20;

// GET /api/stock-count/product-search?q=... — busca produtos do tenant por nome, referência ou
// código de barras, para o funcionário adicionar um item manualmente quando o código de barras
// está ilegível ou o produto não tem código. `select` enxuto (regras de egress no CLAUDE.md).
export async function GET(req: NextRequest) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, products: [] });
    }

    const products = await prisma.product.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q } },
          { barcodes: { some: { code: { contains: q } } } },
        ],
      },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
      select: { id: true, name: true, reference: true, barcode: true, unit: true },
    });

    return NextResponse.json({
      success: true,
      products: products.map((p) => ({
        id: p.id,
        nome: p.name,
        referencia: p.reference,
        codigoBarras: p.barcode,
        unidade: p.unit,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/stock-count/product-search] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro na busca." }, { status: 500 });
  }
}
