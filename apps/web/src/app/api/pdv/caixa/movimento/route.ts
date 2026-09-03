import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { ensureOpenCaixa } from "@/lib/pdvPayment";
import { round2 } from "@/lib/pdvSale";

// POST /api/pdv/caixa/movimento — sangria (retirada) ou suprimento (reforço de troco) no caixa
// aberto do operador, direto da tela do PDV. Equivalente aos botões Sangria/Suprimento do PDV
// legado. Abre um caixa automaticamente se o operador não tiver nenhum.
//  Body: { tipo: "SANGRIA" | "SUPRIMENTO", valor, motivo? }
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const tipo = String(body.tipo || "").toUpperCase() === "SUPRIMENTO" ? "SUPRIMENTO" : "SANGRIA";
    const valor = round2(Number(body.valor) || 0);
    if (valor <= 0) {
      return NextResponse.json({ success: false, error: "Informe um valor maior que zero." }, { status: 400 });
    }
    const motivo = body.motivo ? String(body.motivo).trim().slice(0, 200) : "";

    const cashRegisterId = await ensureOpenCaixa(prisma, {
      tenantId: session.tenantId,
      operatorId: session.userId,
      operatorName: session.name,
    });

    const descPadrao =
      tipo === "SANGRIA"
        ? `Sangria — PDV Restaurante (R$ ${valor.toFixed(2)})`
        : `Suprimento / reforço de troco — PDV Restaurante (R$ ${valor.toFixed(2)})`;

    const movimento = await prisma.cashTransaction.create({
      data: {
        cashRegisterId,
        type: tipo,
        amount: valor,
        description: motivo ? `${descPadrao} — ${motivo}` : descPadrao,
        paymentMethod: "DINHEIRO",
      },
      select: { id: true },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: tipo === "SANGRIA" ? "PDV_CAIXA_SANGRIA" : "PDV_CAIXA_SUPRIMENTO",
      description: `${session.name} lançou ${tipo === "SANGRIA" ? "sangria" : "suprimento"} de R$ ${valor.toFixed(2)} pelo PDV${motivo ? ` — ${motivo}` : ""}.`,
      entityType: "CASH_TRANSACTION",
      entityId: movimento.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, movimentoId: movimento.id });
  } catch (error: any) {
    console.error("[POST /api/pdv/caixa/movimento] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
