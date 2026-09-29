import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { gateCriticalEvent, releaseCriticalAuthorization, formatBRL } from "@/lib/criticalAuth";
import { loadSession, serializeSession, recalcSessionTotals } from "@/lib/pdvSession";

// POST /api/pdv/atendimentos/[id]/reabrir — desfaz o fechamento de uma comanda (correção).
// Evento crítico REABRIR_COMANDA (lib/criticalAuth.ts). Só antes de qualquer NFC-e autorizada.
//  - Hóspede: estorna os lançamentos na conta do quarto (StayConsumption marcados com o id
//    da comanda) e devolve o total ao `totalConsumption`.
//  - O dinheiro já recebido (adiantamentos + acerto) NÃO é estornado do caixa — os pagamentos
//    de fechamento viram "adiantamento" e o `paidAmount` é mantido; ao fechar de novo, o
//    operador só acerta o novo saldo.
// Onde está a comanda (mesa / hóspede / local), para o autorizador saber do que se trata.
function comandaDetails(s: NonNullable<Awaited<ReturnType<typeof loadSession>>>): Record<string, string> {
  const d: Record<string, string> = { Comanda: String(s.comanda.number) };
  if (s.posLocation?.name) d["Local"] = s.posLocation.name;
  if (s.table?.number) d["Mesa"] = String(s.table.number);
  if (s.stayCheckin) d["Hóspede"] = `${s.stayCheckin.primaryGuest?.fullName || "-"} (quarto ${s.stayCheckin.room?.number || "-"})`;
  d["Itens"] = String(s.items.length);
  d["Total"] = formatBRL(Number(s.total));
  if (Number(s.paidAmount) > 0) d["Já pago"] = formatBRL(Number(s.paidAmount));
  return d;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let gateToRelease: { tenantId: string; id: string; channel: string } | null = null;
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const current = await loadSession(id, session.tenantId);
    if (!current) return NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 });
    if (!["AGUARDANDO_FISCAL", "FISCAL_REJEITADA"].includes(current.status)) {
      return NextResponse.json({ success: false, error: "Só dá para reabrir uma comanda fechada e sem cupom autorizado." }, { status: 409 });
    }

    const autorizada = await prisma.fiscalDocument.findFirst({
      where: { comandaSessionId: id, status: "AUTORIZADA" },
      select: { id: true },
    });
    if (autorizada) {
      return NextResponse.json({ success: false, error: "A NFC-e já foi autorizada — cancele o cupom em vez de reabrir." }, { status: 409 });
    }

    const auth = await gateCriticalEvent(req, session, {
      eventType: "REABRIR_COMANDA",
      fingerprint: { atendimentoId: id },
      summary: `Reabrir a comanda ${current.comanda.number}, já fechada (total ${formatBRL(Number(current.total))}).`,
      details: comandaDetails(current),
      authorizationId: body.authorizationId,
    });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
    gateToRelease = { tenantId: session.tenantId, id: auth.authorizationId, channel: auth.channel };
    const motivo = auth.justification || (body.motivo ? String(body.motivo).trim() : "");

    await txWithRetry(async (tx) => {
      const fresh = await tx.comandaSession.findUniqueOrThrow({
        where: { id },
        select: { status: true, customerType: true, stayCheckinId: true, posLocationId: true },
      });
      if (!["AGUARDANDO_FISCAL", "FISCAL_REJEITADA"].includes(fresh.status)) throw new Error("Comanda não está mais fechada.");

      // Devolve ao estoque do PDV o que o fechamento tinha baixado.
      if (fresh.posLocationId) {
        const baixados = await tx.comandaItem.findMany({
          where: { comandaSessionId: id, stockDecremented: true, productId: { not: null } },
          select: { id: true, productId: true, quantity: true },
        });
        for (const it of baixados) {
          const qtd = Math.ceil(Number(it.quantity));
          await tx.pOSProductStock.upsert({
            where: { productId_posLocationId: { productId: it.productId!, posLocationId: fresh.posLocationId } },
            update: { currentStock: { increment: qtd } },
            create: { productId: it.productId!, posLocationId: fresh.posLocationId, currentStock: qtd },
          });
          await tx.comandaItem.update({ where: { id: it.id }, data: { stockDecremented: false } });
        }
      }

      // Descarta documentos fiscais que ainda não foram transmitidos com sucesso.
      await tx.fiscalDocument.updateMany({
        where: { comandaSessionId: id, status: { in: ["PENDENTE", "PROCESSANDO", "REJEITADA", "DENEGADA"] } },
        data: { status: "CANCELADA", rejectionReason: "Comanda reaberta pelo operador." },
      });

      if (fresh.customerType === "HOSPEDE" && fresh.stayCheckinId) {
        await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${fresh.stayCheckinId} FOR UPDATE`;
        // Hospedagem já encerrada: estornar o consumo dela alteraria uma conta fechada (o check-out
        // já foi feito com esse valor). A reabertura da comanda fica bloqueada nesse caso.
        const stayState = await tx.stayCheckin.findFirst({
          where: { id: fresh.stayCheckinId, tenantId: session.tenantId! },
          select: { isClosed: true },
        });
        if (stayState?.isClosed) {
          throw new Error("A hospedagem vinculada a esta comanda já foi encerrada — a comanda não pode ser reaberta.");
        }
        const lancados = await tx.stayConsumption.findMany({
          where: { comandaSessionId: id, stayCheckinId: fresh.stayCheckinId },
          select: { id: true, totalPrice: true },
        });
        const estorno = lancados.reduce((a, c) => a + Number(c.totalPrice), 0);
        await tx.stayConsumption.deleteMany({ where: { comandaSessionId: id, stayCheckinId: fresh.stayCheckinId } });
        if (estorno !== 0) {
          await tx.stayCheckin.update({
            where: { id: fresh.stayCheckinId },
            data: { totalConsumption: { decrement: estorno } },
          });
        }
      }

      // Pagamentos de fechamento passam a contar como adiantamento; paidAmount fica como está.
      await tx.comandaPayment.updateMany({ where: { comandaSessionId: id, kind: "SETTLEMENT" }, data: { kind: "ADVANCE" } });

      await tx.comandaSession.update({ where: { id }, data: { status: "ABERTA", closedAt: null } });
      await recalcSessionTotals(tx, id);
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_REABRIR",
      description: `${session.name} reabriu a comanda ${current.comanda.number} (autorizou: ${auth.authorizedBy.name})${motivo ? ` — ${motivo}` : ""}.`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const updated = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    if (gateToRelease) await releaseCriticalAuthorization(gateToRelease.tenantId, gateToRelease.id, gateToRelease.channel);
    console.error("[POST /api/pdv/atendimentos/[id]/reabrir] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
