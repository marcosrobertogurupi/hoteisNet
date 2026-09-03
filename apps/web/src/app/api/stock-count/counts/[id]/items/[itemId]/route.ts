import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

// Corrige ou remove um item de uma contagem OPEN. Nada aqui altera saldo de estoque.

async function loadOpenItem(tenantId: string, countId: string, itemId: string) {
  return prisma.stockCountItem.findFirst({
    where: { id: itemId, countId, count: { tenantId } },
    select: { id: true, count: { select: { status: true } } },
  });
}

// PATCH — body: { quantity?: number, notes?: string }. quantity sobrescreve o valor contado
// (não soma — o "somar" é só na leitura). quantity 0 é permitido (produto contado como zerado).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id, itemId } = await params;

    const item = await loadOpenItem(session.tenantId, id, itemId);
    if (!item) {
      return NextResponse.json({ success: false, error: "Item não encontrado." }, { status: 404 });
    }
    if (item.count.status !== "OPEN") {
      return NextResponse.json({ success: false, error: "Esta contagem já foi finalizada." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const data: { countedQty?: number; notes?: string | null } = {};

    if (body.quantity !== undefined) {
      const q = Math.trunc(Number(body.quantity));
      if (!Number.isFinite(q) || q < 0) {
        return NextResponse.json({ success: false, error: "Quantidade inválida." }, { status: 400 });
      }
      data.countedQty = q;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes ? String(body.notes).trim().slice(0, 500) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para atualizar." }, { status: 400 });
    }

    const updated = await prisma.stockCountItem.update({
      where: { id: itemId },
      data,
      select: { id: true, countedQty: true, notes: true },
    });

    return NextResponse.json({ success: true, item: { id: updated.id, quantidade: updated.countedQty, observacao: updated.notes } });
  } catch (error: any) {
    console.error("[PATCH /api/stock-count/counts/[id]/items/[itemId]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar o item." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id, itemId } = await params;

    const item = await loadOpenItem(session.tenantId, id, itemId);
    if (!item) {
      return NextResponse.json({ success: false, error: "Item não encontrado." }, { status: 404 });
    }
    if (item.count.status !== "OPEN") {
      return NextResponse.json({ success: false, error: "Esta contagem já foi finalizada." }, { status: 409 });
    }

    await prisma.stockCountItem.delete({ where: { id: itemId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/stock-count/counts/[id]/items/[itemId]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover o item." }, { status: 500 });
  }
}
