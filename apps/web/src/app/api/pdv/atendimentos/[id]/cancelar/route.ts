import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { gateCriticalEvent, releaseCriticalAuthorization, formatBRL } from "@/lib/criticalAuth";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession } from "@/lib/pdvSession";

// POST /api/pdv/atendimentos/[id]/cancelar — cancela um atendimento ainda ABERTO (sem itens
// faturados). Comanda já fechada / aguardando fiscal segue outro fluxo (fase de rejeição).
// Evento crítico CANCELAR_COMANDA (lib/criticalAuth.ts): cancelar uma comanda aberta tira o
// atendimento do faturamento do dia.
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
    if (current.status !== "ABERTA") {
      return NextResponse.json({ success: false, error: "Só é possível cancelar um atendimento aberto." }, { status: 409 });
    }

    const auth = await gateCriticalEvent(req, session, {
      eventType: "CANCELAR_COMANDA",
      fingerprint: { atendimentoId: id },
      summary: `Cancelar a comanda ${current.comanda.number} (${current.items.length} item(ns), total ${formatBRL(Number(current.total))}).`,
      details: comandaDetails(current),
      authorizationId: body.authorizationId,
    });
    if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
    gateToRelease = { tenantId: session.tenantId, id: auth.authorizationId, channel: auth.channel };
    const motivo = auth.justification || (body.motivo ? String(body.motivo).trim() : "");

    const updated = await prisma.comandaSession.updateMany({
      where: { id, tenantId: session.tenantId, status: "ABERTA" },
      data: { status: "CANCELADA", closedAt: new Date() },
    });
    if (updated.count === 0) {
      await releaseCriticalAuthorization(session.tenantId, auth.authorizationId, auth.channel);
      return NextResponse.json({ success: false, error: "Não foi possível cancelar." }, { status: 409 });
    }

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_COMANDA_CANCELAR",
      description: `${session.name} cancelou a comanda ${current.comanda.number}, autorizado por ${auth.authorizedBy.name}${motivo ? ` — ${motivo}` : ""}.`,
      entityType: "COMANDA_SESSION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const s = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, atendimento: s ? serializeSession(s) : null });
  } catch (error: any) {
    if (gateToRelease) await releaseCriticalAuthorization(gateToRelease.tenantId, gateToRelease.id, gateToRelease.channel);
    console.error("[POST /api/pdv/atendimentos/[id]/cancelar] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
