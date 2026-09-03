import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getStockCountUser } from "@/lib/stockCountSession";

// POST /api/stock-count/counts/[id]/scan — lança uma leitura de código de barras na contagem.
// Body: { code: string, quantity: number }.
//  - produto encontrado e ainda não na contagem  → cria o item com a quantidade
//  - produto encontrado e já na contagem          → SOMA a quantidade à existente
//  - código não encontrado no cadastro            → cria o item mesmo assim, marcado
//                                                   "não encontrado no cadastro"
// A contagem nunca altera saldo de estoque — só registra o que o funcionário contou.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const tenantId = session.tenantId;

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const quantity = Math.trunc(Number(body.quantity));

    if (!code) {
      return NextResponse.json({ success: false, error: "Código de barras vazio." }, { status: 400 });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ success: false, error: "Informe uma quantidade maior que zero." }, { status: 400 });
    }

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status !== "OPEN") {
      return NextResponse.json(
        { success: false, error: "Esta contagem já foi finalizada e não aceita novas leituras." },
        { status: 409 }
      );
    }

    // Resolução exata do produto pelo código lido (código de barras legado, id ou um dos códigos
    // vinculados em product_barcodes) — sempre dentro do tenant.
    const product = await prisma.product.findFirst({
      where: {
        tenantId,
        OR: [{ barcode: code }, { id: code }, { barcodes: { some: { code } } }],
      },
      select: { id: true, name: true },
    });

    const result = await txWithRetry(async (tx) => {
      if (product) {
        const existing = await tx.stockCountItem.findFirst({
          where: { countId: id, productId: product.id },
          select: { id: true, countedQty: true },
        });
        if (existing) {
          const updated = await tx.stockCountItem.update({
            where: { id: existing.id },
            data: { countedQty: { increment: quantity }, productNameSnapshot: product.name },
            select: { id: true, countedQty: true },
          });
          return { outcome: "summed" as const, itemId: updated.id, qty: updated.countedQty, nome: product.name, notFound: false };
        }
        const createdItem = await tx.stockCountItem.create({
          data: {
            countId: id,
            productId: product.id,
            barcodeRead: code,
            productNameSnapshot: product.name,
            countedQty: quantity,
            notFound: false,
          },
          select: { id: true, countedQty: true },
        });
        return { outcome: "added" as const, itemId: createdItem.id, qty: createdItem.countedQty, nome: product.name, notFound: false };
      }

      // Não encontrado no cadastro — agrupa pelo próprio código lido.
      const existingUnknown = await tx.stockCountItem.findFirst({
        where: { countId: id, productId: null, barcodeRead: code },
        select: { id: true, countedQty: true },
      });
      if (existingUnknown) {
        const updated = await tx.stockCountItem.update({
          where: { id: existingUnknown.id },
          data: { countedQty: { increment: quantity } },
          select: { id: true, countedQty: true },
        });
        return { outcome: "not_found" as const, itemId: updated.id, qty: updated.countedQty, nome: code, notFound: true };
      }
      const createdUnknown = await tx.stockCountItem.create({
        data: {
          countId: id,
          productId: null,
          barcodeRead: code,
          productNameSnapshot: code,
          countedQty: quantity,
          notFound: true,
          notes: "Código não encontrado no cadastro de produtos.",
        },
        select: { id: true, countedQty: true },
      });
      return { outcome: "not_found" as const, itemId: createdUnknown.id, qty: createdUnknown.countedQty, nome: code, notFound: true };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[POST /api/stock-count/counts/[id]/scan] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao lançar a leitura." }, { status: 500 });
  }
}
