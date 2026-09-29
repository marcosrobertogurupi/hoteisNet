import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { authorizeDiscount, releaseDiscountAuthorization, type DiscountAuthResult } from "@/lib/discountAuth";
import { loadSession, serializeSession, recalcSessionTotals } from "@/lib/pdvSession";
import { round2 } from "@/lib/pdvSale";

// GET  /api/pdv/atendimentos/[id] — detalhe de um atendimento.
// PATCH /api/pdv/atendimentos/[id] — altera dados de cabeçalho (desconto, CPF, nome do cliente,
// mesa). Itens têm rota própria (/itens). Só enquanto ABERTA.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const { id } = await params;
  const s = await loadSession(id, session.tenantId);
  if (!s) return NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 });
  return NextResponse.json({ success: true, atendimento: serializeSession(s) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let authToRelease: DiscountAuthResult | null = null;
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();

    const current = await loadSession(id, session.tenantId);
    if (!current) return NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 });
    if (current.status !== "ABERTA") {
      return NextResponse.json({ success: false, error: "O atendimento já foi fechado." }, { status: 409 });
    }

    const data: Record<string, unknown> = {};

    // Desconto igual ao já gravado não muda nada (nem pede nova autorização, nem apaga quem liberou).
    if (body.desconto !== undefined && round2(Math.max(0, Number(body.desconto) || 0)) !== round2(Number(current.discount) || 0)) {
      const desconto = round2(Math.max(0, Number(body.desconto) || 0));
      data.discount = desconto;
      // Desconto acima do limite do operador (Tenant.maxDiscountPercent) exige autorização de um
      // autorizador (lib/discountAuth.ts e lib/criticalAuth.ts).
      if (desconto > 0) {
        const auth = await authorizeDiscount(req, session, {
          context: "Atendimento do restaurante (PDV)",
          items: [{ discountAmount: desconto, baseAmount: Number(current.subtotal) || 0 }],
          fingerprint: { atendimentoId: id },
          authorizationId: body.authorizationId,
        });
        if (auth.failure) return NextResponse.json(auth.failure.body, { status: auth.failure.status });
        authToRelease = auth;
        data.discountAuthById = auth.authorizedBy?.id ?? null;
        data.discountAuthByName = auth.authorizedBy?.name ?? null;
      } else {
        data.discountAuthById = null;
        data.discountAuthByName = null;
      }
    }

    if (body.cpfNota !== undefined) data.cpfNota = body.cpfNota ? String(body.cpfNota).replace(/\D/g, "") : null;
    if (body.nomeCliente !== undefined) data.customerName = body.nomeCliente ? String(body.nomeCliente).trim() : null;
    if (body.telefoneCliente !== undefined)
      data.customerPhone = body.telefoneCliente ? String(body.telefoneCliente).trim().slice(0, 30) : null;
    if (body.tableId !== undefined) {
      data.tableId = null;
      if (body.tableId) {
        const table = await prisma.hotelTable.findFirst({
          where: { id: body.tableId, tenantId: session.tenantId! },
          select: { id: true },
        });
        data.tableId = table?.id ?? null;
      }
    }

    await txWithRetry(async (tx) => {
      await tx.comandaSession.updateMany({ where: { id, tenantId: session.tenantId! }, data });
      if (data.discount !== undefined) await recalcSessionTotals(tx, id);
    });

    const updated = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    await releaseDiscountAuthorization(authToRelease);
    console.error("[PATCH /api/pdv/atendimentos/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
