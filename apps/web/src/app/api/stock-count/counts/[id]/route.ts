import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

// GET /api/stock-count/counts/[id] — a contagem e os itens já lançados, para a tela de contagem no
// celular. `select` enxuto — só o que a lista desenha.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId: session.tenantId },
      select: {
        id: true,
        posLocationId: true,
        status: true,
        startedByName: true,
        note: true,
        createdAt: true,
        finishedAt: true,
        posLocation: { select: { name: true } },
        items: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            productId: true,
            barcodeRead: true,
            productNameSnapshot: true,
            countedQty: true,
            notFound: true,
            notes: true,
          },
        },
      },
    });

    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      count: {
        id: count.id,
        alvo: count.posLocation?.name ?? "Estoque geral / almoxarifado",
        isGeneral: count.posLocationId === null,
        status: count.status,
        conferente: count.startedByName,
        observacao: count.note,
        criadaEm: count.createdAt,
        finalizadaEm: count.finishedAt,
      },
      items: count.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        codigoBarras: i.barcodeRead,
        nome: i.productNameSnapshot,
        quantidade: i.countedQty,
        naoEncontrado: i.notFound,
        observacao: i.notes,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/stock-count/counts/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}
