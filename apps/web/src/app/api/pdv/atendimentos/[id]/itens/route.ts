import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession, recalcSessionTotals } from "@/lib/pdvSession";
import { resolveSellableItem, itemTotal, round2 } from "@/lib/pdvSale";

// Itens de um atendimento. POST: adiciona (por dishId | productId | código de barras).
// PATCH: quantidade/desconto/observação de um item. DELETE: cancela o item (não apaga).
// Só enquanto ABERTA.

async function guard(req: NextRequest, id: string) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) return { err: NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 }) };
  const current = await loadSession(id, session.tenantId);
  if (!current) return { err: NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 }) };
  if (current.status !== "ABERTA") return { err: NextResponse.json({ success: false, error: "O atendimento já foi fechado." }, { status: 409 }) };
  return { session, current };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(req, id);
    if (g.err) return g.err;
    const { session } = g;

    const body = await req.json();
    const quantity = Math.max(0.001, Number(body.quantidade) || 1);
    const discount = round2(Math.max(0, Number(body.desconto) || 0));

    await txWithRetry(async (tx) => {
      const item = await resolveSellableItem(tx, session!.tenantId!, {
        dishId: body.dishId ?? null,
        productId: body.productId ?? null,
        barcode: body.codigoBarras ? String(body.codigoBarras).trim() : null,
      });
      if (!item) throw new Error("Item não encontrado no catálogo.");
      // O perfil fiscal NÃO é exigido para vender — só para emitir a NFC-e depois. Um item sem
      // perfil entra na comanda normalmente; a emissão do cupom é que vai cobrar a tributação.

      await tx.comandaItem.create({
        data: {
          comandaSessionId: id,
          dishId: item.dishId,
          productId: item.productId,
          name: item.name,
          note: body.observacao ? String(body.observacao).trim().slice(0, 300) : null,
          unitPrice: item.unitPrice,
          quantity,
          discount,
          total: itemTotal(item.unitPrice, quantity, discount),
          fiscalSnapshot: item.fiscalSnapshot ? (item.fiscalSnapshot as object) : undefined,
          operatorId: session!.userId,
          operatorName: session!.name,
        },
      });
      await recalcSessionTotals(tx, id);
    });

    const updated = await loadSession(id, session!.tenantId!);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/itens] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(req, id);
    if (g.err) return g.err;
    const { session } = g;

    const body = await req.json();
    if (!body.itemId) return NextResponse.json({ success: false, error: "itemId é obrigatório." }, { status: 400 });

    await txWithRetry(async (tx) => {
      const item = await tx.comandaItem.findFirst({
        where: { id: body.itemId, comandaSessionId: id },
        select: { unitPrice: true, quantity: true, discount: true, canceled: true },
      });
      if (!item) throw new Error("Item não encontrado neste atendimento.");
      if (item.canceled) throw new Error("Este item foi cancelado.");

      const quantity = body.quantidade !== undefined ? Math.max(0.001, Number(body.quantidade) || 1) : Number(item.quantity);
      const discount = body.desconto !== undefined ? round2(Math.max(0, Number(body.desconto) || 0)) : Number(item.discount);
      const note = body.observacao !== undefined ? (body.observacao ? String(body.observacao).trim().slice(0, 300) : null) : undefined;

      await tx.comandaItem.update({
        where: { id: body.itemId },
        data: { quantity, discount, total: itemTotal(Number(item.unitPrice), quantity, discount), note },
      });
      await recalcSessionTotals(tx, id);
    });

    const updated = await loadSession(id, session!.tenantId!);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    console.error("[PATCH /api/pdv/atendimentos/[id]/itens] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const g = await guard(req, id);
    if (g.err) return g.err;
    const { session } = g;

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");
    const motivo = searchParams.get("motivo") || "";
    if (!itemId) return NextResponse.json({ success: false, error: "itemId é obrigatório." }, { status: 400 });

    // Cancelamento (não exclusão): o item fica marcado, sai dos totais e do payload fiscal, e
    // mantém o rastro — igual ao "*** ITEM CANCELADO ***" do sistema legado.
    await txWithRetry(async (tx) => {
      const upd = await tx.comandaItem.updateMany({
        where: { id: itemId, comandaSessionId: id, canceled: false },
        data: {
          canceled: true,
          canceledReason: motivo ? motivo.trim().slice(0, 300) : null,
          canceledByUserId: session!.userId,
          canceledByUserName: session!.name,
          canceledAt: new Date(),
        },
      });
      if (upd.count === 0) throw new Error("Item não encontrado ou já cancelado.");
      await recalcSessionTotals(tx, id);
    });

    await logActivity({
      tenantId: session!.tenantId!,
      userId: session!.userId,
      userName: session!.name,
      action: "PDV_COMANDA_ITEM_CANCELAR",
      description: `${session!.name} cancelou um item da comanda${motivo ? ` — ${motivo}` : ""}.`,
      entityType: "COMANDA_ITEM",
      entityId: itemId,
    });

    const updated = await loadSession(id, session!.tenantId!);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    console.error("[DELETE /api/pdv/atendimentos/[id]/itens] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
