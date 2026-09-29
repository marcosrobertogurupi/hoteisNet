import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";
import { sendUazapiText } from "@/lib/uazapi";
import { resolveAppBaseUrl } from "@/lib/preCheckinLink";
import { CRITICAL_EVENT_LABELS, hashLinkToken, type CriticalEventType } from "@/lib/criticalAuth";

const NOT_PENDING_ERROR = "Esta solicitação não está mais aguardando autorização. Refaça a operação.";

// POST /api/autorizacoes/[id]/enviar — "Enviar para um autorizador": manda ao WhatsApp do
// autorizador ESCOLHIDO pelo operador um link único (15 min, nunca reutilizável) com todos os
// dados do evento, para ele aprovar ou recusar a distância (página pública /autorizar/[token]).
//
// Segurança: só quem pediu envia a própria solicitação; o autorizador é revalidado contra o
// tenant da sessão e a marca isAuthorizer (CLAUDE.md §2/§4); o telefone vem do cadastro do
// usuário, nunca do body (§7); o token vai só na mensagem — o banco guarda o hash. Reenviar gera
// um token novo, e o link anterior deixa de valer.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;
    const { id } = await params;
    const body = await req.json();
    const authorizerId = String(body.autorizadorId || "");
    const justification = String(body.justificativa || "").trim().slice(0, 500);

    if (!authorizerId) {
      return NextResponse.json({ success: false, error: "Escolha para qual autorizador enviar." }, { status: 400 });
    }
    if (justification.length < 3) {
      return NextResponse.json({ success: false, error: "Informe a justificativa do pedido." }, { status: 400 });
    }

    // Evita disparar uma enxurrada de mensagens para o celular do gerente.
    const rate = await checkRateLimit(`critical-auth-send:${session.userId}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: `Muitos envios seguidos. Tente novamente em ${rate.retryAfterSeconds}s.` },
        { status: 429 }
      );
    }

    const request = await prisma.criticalAuthorization.findFirst({
      where: { id, tenantId, requestedById: session.userId },
      select: {
        status: true,
        expiresAt: true,
        eventType: true,
        summary: true,
        requestedByName: true,
        requestedTerminal: true,
        tenant: { select: { name: true, tradeName: true } },
      },
    });
    if (!request) return NextResponse.json({ success: false, error: "Solicitação não encontrada." }, { status: 404 });
    if (request.status !== "PENDENTE" || request.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ success: false, error: NOT_PENDING_ERROR }, { status: 409 });
    }

    const approver = await prisma.user.findFirst({
      where: { id: authorizerId, tenantId, active: true, isAuthorizer: true },
      select: { id: true, name: true, phone: true },
    });
    if (!approver) {
      return NextResponse.json({ success: false, error: "Autorizador não encontrado." }, { status: 404 });
    }
    if (!approver.phone?.replace(/\D/g, "")) {
      return NextResponse.json(
        { success: false, error: `${approver.name} não tem WhatsApp cadastrado. Cadastre em Cadastros › Usuários.` },
        { status: 400 }
      );
    }

    const token = randomBytes(32).toString("base64url");
    const armed = await prisma.criticalAuthorization.updateMany({
      where: { id, tenantId, status: "PENDENTE", expiresAt: { gt: new Date() } },
      data: {
        linkTokenHash: hashLinkToken(token),
        targetApproverId: approver.id,
        justification,
        linkSentAt: new Date(),
      },
    });
    if (armed.count === 0) {
      return NextResponse.json({ success: false, error: NOT_PENDING_ERROR }, { status: 409 });
    }

    const hotel = request.tenant.tradeName || request.tenant.name;
    const evento = CRITICAL_EVENT_LABELS[request.eventType as CriticalEventType] || request.eventType;
    const validoAte = request.expiresAt.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
    const message =
      `🔐 *Autorização solicitada — ${hotel}*\n\n` +
      `*${evento}*\n${request.summary}\n\n` +
      `Pedido por: ${request.requestedByName}${request.requestedTerminal ? ` (${request.requestedTerminal})` : ""}\n` +
      `Justificativa: ${justification}\n\n` +
      `Abra o link para ver os detalhes e aprovar ou recusar (válido até ${validoAte}, uso único):\n` +
      `${resolveAppBaseUrl()}/autorizar/${token}`;

    const sent = await sendUazapiText(approver.phone!, message, tenantId);
    if (!sent) {
      // Mensagem não saiu: o link não existe para ninguém — desarma para não ficar um hash órfão.
      await prisma.criticalAuthorization.updateMany({
        where: { id, tenantId, linkTokenHash: hashLinkToken(token) },
        data: { linkTokenHash: null, linkSentAt: null },
      });
      return NextResponse.json(
        { success: false, error: "Não foi possível enviar pelo WhatsApp. Verifique a conexão do WhatsApp do hotel ou autorize aqui." },
        { status: 502 }
      );
    }

    await logActivity({
      tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CRITICAL_AUTH_LINK_SENT",
      description: `${session.name} enviou para ${approver.name} (WhatsApp) o pedido de autorização: ${request.summary}`,
      entityType: "CRITICAL_AUTHORIZATION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, enviadoPara: approver.name });
  } catch (error) {
    console.error("[POST /api/autorizacoes/[id]/enviar] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao enviar a solicitação." }, { status: 500 });
  }
}
