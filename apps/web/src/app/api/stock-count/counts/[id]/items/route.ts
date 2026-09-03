import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getStockCountUser } from "@/lib/stockCountSession";

// POST /api/stock-count/counts/[id]/items — adiciona um item à contagem escolhendo o produto pela
// busca (código de barras ilegível / produto sem código). Body: { productId, quantity }.
// Mesma regra de soma do scan: se o produto já está na contagem, soma a quantidade.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const tenantId = session.tenantId;

    const body = await req.json().catch(() => ({}));
    const productId = String(body.productId || "");
    const quantity = Math.trunc(Number(body.quantity));

    if (!productId) {
      return NextResponse.json({ success: false, error: "Selecione o produto." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: "Informe uma quantidade maior que zero." }, { status: 400 });
    }

    const count = await prisma.stockCount.findFirst({ where: { id, tenantId }, select: { status: true } });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status !== "OPEN") {
      return NextResponse.json(
        { success: false, error: "Esta contagem já foi finalizada e não aceita novos itens." },
        { status: 409 }
      );
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, name: true, barcode: true },
    });
    if (!product) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }

    const result = await txWithRetry(async (tx) => {
      const existing = await tx.stockCountItem.findFirst({
        where: { countId: id, productId: product.id },
        select: { id: true },
      });
      if (existing) {
        const updated = await tx.stockCountItem.update({
          where: { id: existing.id },
          data: { countedQty: { increment: quantity }, productNameSnapshot: product.name },
          select: { id: true, countedQty: true },
        });
        return { outcome: "summed" as const, itemId: updated.id, qty: updated.countedQty };
      }
      const created = await tx.stockCountItem.create({
        data: {
          countId: id,
          productId: product.id,
          barcodeRead: product.barcode ?? null,
          productNameSnapshot: product.name,
          countedQty: quantity,
          notFound: false,
        },
        select: { id: true, countedQty: true },
      });
      return { outcome: "added" as const, itemId: created.id, qty: created.countedQty };
    });

    return NextResponse.json({ success: true, nome: product.name, notFound: false, ...result });
  } catch (error: any) {
    console.error("[POST /api/stock-count/counts/[id]/items] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao adicionar o item." }, { status: 500 });
  }
}
