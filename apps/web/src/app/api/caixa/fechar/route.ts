import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";

// POST /api/caixa/fechar — fecha (cegamente) o caixa aberto do operador autenticado, calculando o
// saldo esperado a partir das movimentações gravadas. operatorId/tenantId vêm sempre da sessão do
// servidor, nunca do corpo da requisição, para impedir que um operador feche o caixa de outro.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    if (!session.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const { saldoInformado } = body;

    // Fechamento dentro de uma transação, com a linha do caixa travada: o saldo é calculado e o
    // caixa fechado no mesmo passo atômico. Antes eram leituras e escrita soltas — um segundo clique
    // em "Fechar" (ou outro terminal) fechava o mesmo caixa de novo com outro saldo.
    const outcome = await txWithRetry(async (tx) => {
      const open = await tx.cashRegister.findFirst({
        where: { operatorId: session.userId, isOpen: true, tenantId: session.tenantId! },
        select: { id: true },
      });
      if (!open) return null;
      await tx.$queryRaw`SELECT id FROM cash_registers WHERE id = ${open.id} FOR UPDATE`;
      const fresh = await tx.cashRegister.findFirst({
        where: { id: open.id, isOpen: true },
        select: { id: true, transactions: { select: { type: true, amount: true, countsInCashTotal: true } } },
      });
      if (!fresh) return null;

      const totalEntradas = fresh.transactions
        .filter((t) => (t.type === "ENTRADA" || t.type === "SUPRIMENTO") && t.countsInCashTotal)
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalSangrias = fresh.transactions
        .filter((t) => t.type === "SANGRIA")
        .reduce((s, t) => s + Number(t.amount), 0);
      const saldoCalculado = totalEntradas - totalSangrias;

      await tx.cashRegister.updateMany({
        where: { id: fresh.id, tenantId: session.tenantId!, isOpen: true },
        data: { isOpen: false, closedAt: new Date(), closingBalance: saldoCalculado },
      });
      return { caixaId: fresh.id, saldoCalculado };
    });
    if (!outcome) {
      return NextResponse.json({ success: false, error: "Nenhum caixa aberto para este operador." }, { status: 404 });
    }
    const caixa = { id: outcome.caixaId };
    const saldoCalculado = outcome.saldoCalculado;
    const informado = Number(saldoInformado || 0);
    const diferenca = Math.round((informado - saldoCalculado) * 100) / 100;

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CASH_CLOSE",
      // Fechamento cego: o valor contado pelo operador e a diferença (sobra/falta) ficam registrados —
      // antes só o saldo calculado era gravado e a quebra de caixa se perdia.
      description:
        `${session.name} fechou o caixa. Saldo calculado: R$ ${saldoCalculado.toFixed(2)}; ` +
        `valor informado: R$ ${informado.toFixed(2)}; ` +
        `${diferenca === 0 ? "caixa conferido" : diferenca > 0 ? `SOBRA de R$ ${diferenca.toFixed(2)}` : `FALTA de R$ ${Math.abs(diferenca).toFixed(2)}`}.`,
      entityType: "CASH_REGISTER",
      entityId: caixa.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      caixaId: caixa.id,
      saldoCalculado,
      saldoInformado: informado,
      diferenca,
      status: diferenca === 0 ? "CAIXA_CONFERIDO" : diferenca > 0 ? "SOBRA" : "FALTA",
      message: `Caixa fechado. Saldo: R$ ${saldoCalculado.toFixed(2)}.`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/fechar] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao fechar caixa." }, { status: 500 });
  }
}
