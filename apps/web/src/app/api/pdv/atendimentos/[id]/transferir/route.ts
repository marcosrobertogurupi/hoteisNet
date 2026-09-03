import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { verifyAdminStepUp } from "@/lib/adminAuth";
import { loadSession, serializeSession, recalcSessionTotals } from "@/lib/pdvSession";
import { round2 } from "@/lib/pdvSale";

// POST /api/pdv/atendimentos/[id]/transferir — move débito de uma comanda (origem = [id]) para
// outra. modo "COMANDA" junta a comanda inteira (origem fica cancelada); modo "ITENS" move os
// itens informados. Exige autorização de administrador, verificada no servidor (não só na UI),
// e grava ComandaDebitTransfer para auditoria permanente — espelha a transferência entre quartos.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const modo = String(body.modo || "").toUpperCase() === "ITENS" ? "ITENS" : "COMANDA";
    const destinoId = String(body.destinoSessionId || "");
    const itemIds: string[] = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];

    if (!destinoId || destinoId === id) {
      return NextResponse.json({ success: false, error: "Escolha uma comanda de destino diferente." }, { status: 400 });
    }
    if (modo === "ITENS" && itemIds.length === 0) {
      return NextResponse.json({ success: false, error: "Selecione os itens a transferir." }, { status: 400 });
    }

    const auth = await verifyAdminStepUp(body.adminEmail, body.adminPassword, session.tenantId);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const [origem, destino] = await Promise.all([
      loadSession(id, session.tenantId),
      loadSession(destinoId, session.tenantId),
    ]);
    if (!origem || !destino) {
      return NextResponse.json({ success: false, error: "Comanda de origem ou destino não encontrada." }, { status: 404 });
    }
    if (origem.status !== "ABERTA" || destino.status !== "ABERTA") {
      return NextResponse.json({ success: false, error: "As duas comandas precisam estar abertas." }, { status: 409 });
    }

    const movingIds = modo === "COMANDA" ? origem.items.map((i) => i.id) : itemIds.filter((iid) => origem.items.some((i) => i.id === iid));
    if (movingIds.length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum item válido para transferir." }, { status: 400 });
    }
    const movedAmount = round2(
      origem.items.filter((i) => movingIds.includes(i.id)).reduce((a, i) => a + Number(i.total), 0)
    );

    await txWithRetry(async (tx) => {
      await tx.comandaItem.updateMany({
        where: { id: { in: movingIds }, comandaSessionId: id },
        data: { comandaSessionId: destinoId },
      });

      if (modo === "COMANDA") {
        // Junta a comanda inteira: os pagamentos parciais já recebidos na origem seguem para o
        // destino (o dinheiro entrou por essa conta), e a origem fica zerada e cancelada.
        const movedPaid = Number(origem.paidAmount);
        await tx.comandaPayment.updateMany({ where: { comandaSessionId: id }, data: { comandaSessionId: destinoId } });
        await tx.comandaSession.update({
          where: { id: destinoId },
          data: { paidAmount: { increment: movedPaid } },
        });
        await tx.comandaSession.update({
          where: { id },
          data: { status: "CANCELADA", closedAt: new Date(), subtotal: 0, total: 0, paidAmount: 0 },
        });
        await recalcSessionTotals(tx, destinoId);
      } else {
        // Move só itens: os pagamentos parciais ficam na comanda de origem.
        await recalcSessionTotals(tx, destinoId);
        await recalcSessionTotals(tx, id);
      }

      await tx.comandaDebitTransfer.create({
        data: {
          tenantId: session.tenantId!,
          fromSessionId: id,
          toSessionId: destinoId,
          mode: modo === "COMANDA" ? "FULL" : "ITEMS",
          amount: movedAmount,
          itemsCount: movingIds.length,
          operatorId: session.userId,
          operatorName: session.name,
          authorizedByUserId: auth.admin.id,
          authorizedByUserName: auth.admin.name,
        },
      });
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_TRANSFERIR_DEBITO",
      description: `${session.name} transferiu ${modo === "COMANDA" ? "a comanda inteira" : `${movingIds.length} item(ns)`} (R$ ${movedAmount.toFixed(2)}) da comanda ${origem.comanda.number} para a ${destino.comanda.number}. Autorizou: ${auth.admin.name}.`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const [o, d] = await Promise.all([loadSession(id, session.tenantId), loadSession(destinoId, session.tenantId)]);
    return NextResponse.json({
      success: true,
      origem: o ? serializeSession(o) : null,
      destino: d ? serializeSession(d) : null,
    });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/transferir] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
