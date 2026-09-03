import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { verifyAdminStepUp } from "@/lib/adminAuth";
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

    if (body.desconto !== undefined) {
      const desconto = round2(Math.max(0, Number(body.desconto) || 0));
      data.discount = desconto;
      // Desconto acima do limite do operador (Tenant.maxDiscountPercent) exige senha de admin,
      // mesmo padrão da cortesia de check-in.
      if (desconto > 0) {
        const [tenant] = await Promise.all([
          prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { maxDiscountPercent: true } }),
        ]);
        const subtotal = Number(current.subtotal) || 0;
        const percent = subtotal > 0 ? (desconto / subtotal) * 100 : 100;
        const limite = Number(tenant?.maxDiscountPercent ?? 20);
        if (percent > limite + 0.001) {
          const auth = await verifyAdminStepUp(body.adminEmail, body.adminPassword, session.tenantId);
          if (!auth.ok) {
            return NextResponse.json(
              { success: false, error: auth.error, precisaAutorizacao: true, limitePercent: limite },
              { status: auth.status }
            );
          }
          data.discountAuthById = auth.admin.id;
          data.discountAuthByName = auth.admin.name;
        } else {
          data.discountAuthById = null;
          data.discountAuthByName = null;
        }
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
    console.error("[PATCH /api/pdv/atendimentos/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
