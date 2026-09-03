import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession } from "@/lib/pdvSession";
import { round2 } from "@/lib/pdvSale";
import { normalizePagamentos, pagamentosInvalid, ensureOpenCaixa, postComandaPaymentEvent } from "@/lib/pdvPayment";

// POST /api/pdv/atendimentos/[id]/fechar — fecha o atendimento e o deixa AGUARDANDO_FISCAL (a
// emissão da NFC-e/NF-e é fase posterior). Considera pagamentos parciais já recebidos
// (paidAmount): só o SALDO restante precisa ser acertado no fechamento.
//  - Passante: os pagamentos informados devem cobrir o saldo (troco só em dinheiro).
//  - Hóspede: o saldo (menos o que ele pagar em dinheiro/cartão agora) vai para a conta do quarto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const current = await loadSession(id, session.tenantId);
    if (!current) return NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 });
    if (current.status !== "ABERTA") {
      return NextResponse.json({ success: false, error: "O atendimento já foi fechado." }, { status: 409 });
    }
    const itensAtivos = current.items.filter((it) => !it.canceled);
    if (itensAtivos.length === 0) {
      return NextResponse.json({ success: false, error: "Adicione ao menos um item antes de fechar." }, { status: 400 });
    }

    const total = round2(Number(current.total));
    const jaPago = round2(Number(current.paidAmount));
    const saldo = round2(total - jaPago);
    const isHospede = current.customerType === "HOSPEDE";

    const pagamentos = normalizePagamentos(body.pagamentos).filter((p) => p.forma !== "CONTA_QUARTO");
    const somaPag = round2(pagamentos.reduce((a, p) => a + p.valor, 0));

    if (pagamentos.length > 0) {
      const invalid = pagamentosInvalid(pagamentos);
      if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });
    }

    let troco = 0;
    let roomAmount = 0;

    if (isHospede) {
      // O hóspede pode acertar parte em dinheiro/cartão agora; o resto vai para o quarto.
      if (somaPag - 0.005 > Math.max(0, saldo)) {
        return NextResponse.json(
          { success: false, error: `Pagamento acima do saldo (R$ ${Math.max(0, saldo).toFixed(2)}). Numa comanda de hóspede não há troco.` },
          { status: 400 }
        );
      }
      roomAmount = round2(saldo - somaPag); // pode ser negativo se houver superpagamento por adiantamento
    } else {
      if (saldo > 0.005) {
        if (pagamentos.length === 0) {
          return NextResponse.json({ success: false, error: "Informe o pagamento do saldo para fechar a comanda." }, { status: 400 });
        }
        if (somaPag + 0.005 < saldo) {
          return NextResponse.json(
            { success: false, error: `Pagamento insuficiente: R$ ${somaPag.toFixed(2)} para um saldo de R$ ${saldo.toFixed(2)}.` },
            { status: 400 }
          );
        }
        troco = round2(somaPag - saldo);
        if (troco > 0 && !pagamentos.some((p) => p.forma === "DINHEIRO")) {
          return NextResponse.json({ success: false, error: "Só há troco em pagamento com dinheiro." }, { status: 400 });
        }
      } else if (pagamentos.length > 0) {
        return NextResponse.json({ success: false, error: "A comanda já está paga — não informe pagamento no fechamento." }, { status: 400 });
      }
    }

    await txWithRetry(async (tx) => {
      const fresh = await tx.comandaSession.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          total: true,
          paidAmount: true,
          discount: true,
          customerType: true,
          stayCheckinId: true,
          customerName: true,
          posLocationId: true,
          comanda: { select: { number: true } },
        },
      });
      if (fresh.status !== "ABERTA") throw new Error("O atendimento já foi fechado.");

      // Baixa do estoque do PDV (POSLocation): só itens que são Product (industrializados têm
      // estoque; pratos preparados não). Bloqueia se faltar saldo e o tenant não aceitar
      // estoque negativo — mesma regra do lançamento de consumo do quarto.
      const produtosParaBaixar = await tx.comandaItem.findMany({
        where: { comandaSessionId: id, canceled: false, stockDecremented: false, productId: { not: null } },
        select: { id: true, name: true, productId: true, quantity: true },
      });
      if (produtosParaBaixar.length > 0) {
        if (!fresh.posLocationId) throw new Error("Comanda sem PDV definido — não é possível baixar o estoque.");
        const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId! }, select: { allowNegativeStock: true } });
        for (const it of produtosParaBaixar) {
          const qtd = Math.ceil(Number(it.quantity));
          const stock = await tx.pOSProductStock.findUnique({
            where: { productId_posLocationId: { productId: it.productId!, posLocationId: fresh.posLocationId } },
            select: { currentStock: true },
          });
          const disp = stock?.currentStock ?? 0;
          if (disp < qtd && !tenant?.allowNegativeStock) {
            throw new Error(`Estoque insuficiente de "${it.name}" neste PDV (disponível: ${disp}).`);
          }
          await tx.pOSProductStock.upsert({
            where: { productId_posLocationId: { productId: it.productId!, posLocationId: fresh.posLocationId } },
            update: { currentStock: { decrement: qtd } },
            create: { productId: it.productId!, posLocationId: fresh.posLocationId, currentStock: -qtd },
          });
          await tx.comandaItem.update({ where: { id: it.id }, data: { stockDecremented: true } });
        }
      }

      const cashRegisterId =
        pagamentos.length > 0
          ? await ensureOpenCaixa(tx, { tenantId: session.tenantId!, operatorId: session.userId, operatorName: session.name })
          : null;

      let collectedNow = 0;
      if (cashRegisterId && pagamentos.length > 0) {
        collectedNow = await postComandaPaymentEvent(tx, {
          sessionId: id,
          comandaNumber: fresh.comanda.number,
          customerName: fresh.customerName || current.stayCheckin?.primaryGuest?.fullName || null,
          cashRegisterId,
          kind: "SETTLEMENT",
          pagamentos,
          troco,
          operatorId: session.userId,
          operatorName: session.name,
        });
      }

      if (isHospede) {
        if (!fresh.stayCheckinId) throw new Error("Hospedagem não vinculada ao atendimento.");
        await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${fresh.stayCheckinId} FOR UPDATE`;

        for (const it of itensAtivos) {
          await tx.stayConsumption.create({
            data: {
              stayCheckinId: fresh.stayCheckinId,
              comandaSessionId: id,
              productId: it.productId || null,
              productName: `${it.name} (Comanda ${fresh.comanda.number})`,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
              totalPrice: Number(it.total),
              operatorId: session.userId,
              operatorName: session.name,
            },
          });
        }
        const headerDiscount = round2(Number(fresh.discount));
        if (headerDiscount > 0) {
          await tx.stayConsumption.create({
            data: {
              stayCheckinId: fresh.stayCheckinId,
              comandaSessionId: id,
              productName: `Desconto — Comanda ${fresh.comanda.number}`,
              quantity: 1,
              unitPrice: -headerDiscount,
              totalPrice: -headerDiscount,
              operatorId: session.userId,
              operatorName: session.name,
            },
          });
        }
        const alreadyCollected = round2(Number(fresh.paidAmount) + collectedNow);
        if (alreadyCollected > 0) {
          await tx.stayConsumption.create({
            data: {
              stayCheckinId: fresh.stayCheckinId,
              comandaSessionId: id,
              productName: `Pagamento recebido no PDV — Comanda ${fresh.comanda.number}`,
              quantity: 1,
              unitPrice: -alreadyCollected,
              totalPrice: -alreadyCollected,
              operatorId: session.userId,
              operatorName: session.name,
            },
          });
        }
        // Net lançado no quarto = total - (adiantamentos + acerto em dinheiro/cartão) = roomAmount.
        await tx.stayCheckin.update({
          where: { id: fresh.stayCheckinId },
          data: { totalConsumption: { increment: roomAmount } },
        });
        await tx.comandaSession.update({
          where: { id },
          data: { status: "AGUARDANDO_FISCAL", closedAt: new Date(), paidAmount: alreadyCollected },
        });
      } else {
        await tx.comandaSession.update({
          where: { id },
          data: { status: "AGUARDANDO_FISCAL", closedAt: new Date(), paidAmount: round2(Number(fresh.total)) },
        });
      }
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_FECHAR",
      description:
        `${session.name} fechou a comanda ${current.comanda.number} (total R$ ${total.toFixed(2)}` +
        (jaPago > 0 ? `, adiantado R$ ${jaPago.toFixed(2)}` : "") +
        (isHospede ? `, R$ ${Math.max(0, roomAmount).toFixed(2)} na conta do quarto` : "") +
        `).`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const updated = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null, troco });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/fechar] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
