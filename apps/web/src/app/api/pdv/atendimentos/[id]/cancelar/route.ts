import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession } from "@/lib/pdvSession";

// POST /api/pdv/atendimentos/[id]/cancelar — cancela um atendimento ainda ABERTO (sem itens
// faturados). Comanda já fechada / aguardando fiscal segue outro fluxo (fase de rejeição).
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
      return NextResponse.json({ success: false, error: "Só é possível cancelar um atendimento aberto." }, { status: 409 });
    }

    const updated = await prisma.comandaSession.updateMany({
      where: { id, tenantId: session.tenantId, status: "ABERTA" },
      data: { status: "CANCELADA", closedAt: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Não foi possível cancelar." }, { status: 409 });
    }

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_CANCELAR",
      description: `${session.name} cancelou a comanda ${current.comanda.number}${body.motivo ? ` — ${String(body.motivo).trim()}` : ""}.`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const s = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: s ? serializeSession(s) : null });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/cancelar] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
