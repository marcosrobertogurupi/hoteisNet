import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession } from "@/lib/pdvSession";
import { round2 } from "@/lib/pdvSale";
import { normalizePagamentos, pagamentosInvalid, ensureOpenCaixa, postComandaPaymentEvent } from "@/lib/pdvPayment";

// POST /api/pdv/atendimentos/[id]/pagamentos — pagamento PARCIAL de uma comanda ainda aberta:
// o cliente (hóspede ou passante) quita parte da conta e segue consumindo. O dinheiro entra no
// caixa agora; o saldo restante é cobrado no fechamento. Não fecha a comanda.
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
      return NextResponse.json({ success: false, error: "Só é possível pagar parcialmente uma comanda aberta." }, { status: 409 });
    }

    const pagamentos = normalizePagamentos(body.pagamentos);
    const invalid = pagamentosInvalid(pagamentos);
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 });
    if (pagamentos.some((p) => p.forma === "CONTA_QUARTO")) {
      return NextResponse.json(
        { success: false, error: "Pagamento parcial é dinheiro/cartão/PIX. A conta do quarto é acertada no fechamento." },
        { status: 400 }
      );
    }

    const saldoAtual = round2(Number(current.total) - Number(current.paidAmount));
    const soma = round2(pagamentos.reduce((a, p) => a + p.valor, 0));
    if (saldoAtual <= 0) {
      return NextResponse.json({ success: false, error: "A comanda já está totalmente paga." }, { status: 400 });
    }
    if (soma - 0.005 > saldoAtual) {
      return NextResponse.json(
        { success: false, error: `Pagamento parcial acima do saldo (R$ ${saldoAtual.toFixed(2)}). Para quitar com troco, use o fechamento.` },
        { status: 400 }
      );
    }

    await txWithRetry(async (tx) => {
      const fresh = await tx.comandaSession.findUniqueOrThrow({
        where: { id },
        select: { status: true, total: true, paidAmount: true, comanda: { select: { number: true } } },
      });
      if (fresh.status !== "ABERTA") throw new Error("A comanda já foi fechada.");
      const saldo = round2(Number(fresh.total) - Number(fresh.paidAmount));
      if (soma - 0.005 > saldo) throw new Error(`Pagamento parcial acima do saldo (R$ ${saldo.toFixed(2)}).`);

      const cashRegisterId = await ensureOpenCaixa(tx, {
        tenantId: session.tenantId!,
        operatorId: session.userId,
        operatorName: session.name,
      });
      const lancado = await postComandaPaymentEvent(tx, {
        sessionId: id,
        comandaNumber: fresh.comanda.number,
        customerName: current.customerName || current.stayCheckin?.primaryGuest?.fullName || null,
        cashRegisterId,
        kind: "ADVANCE",
        pagamentos,
        troco: 0,
        operatorId: session.userId,
        operatorName: session.name,
      });
      await tx.comandaSession.update({ where: { id }, data: { paidAmount: { increment: lancado } } });
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_PAGAMENTO_PARCIAL",
      description: `${session.name} recebeu pagamento parcial de R$ ${soma.toFixed(2)} na comanda ${current.comanda.number}.`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const updated = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/pagamentos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
