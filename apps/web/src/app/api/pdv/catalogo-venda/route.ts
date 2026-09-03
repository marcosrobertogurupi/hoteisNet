import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/pdv/catalogo-venda — catálogo enxuto para a tela de venda do PDV: pratos e produtos
// com preço e se já têm perfil fiscal (só quem tem perfil pode ser faturado no fechamento).
// Uma chamada na carga da tela; a busca por item é local. Sem histórico, sem colunas extras.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const [dishes, products] = await Promise.all([
      prisma.dish.findMany({
        where: { tenantId: session.tenantId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, category: true, price: true, fiscalProfileId: true },
      }),
      prisma.product.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, category: true, salePrice: true, barcode: true, fiscalProfileId: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      itens: [
        ...dishes.map((d) => ({
          tipo: "PRATO" as const,
          id: d.id,
          nome: d.name,
          categoria: d.category,
          preco: Number(d.price),
          codigoBarras: null as string | null,
          temPerfilFiscal: !!d.fiscalProfileId,
        })),
        ...products.map((p) => ({
          tipo: "PRODUTO" as const,
          id: p.id,
          nome: p.name,
          categoria: p.category,
          preco: Number(p.salePrice),
          codigoBarras: p.barcode,
          temPerfilFiscal: !!p.fiscalProfileId,
        })),
      ],
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/catalogo-venda] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
