import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";
import { CRITICAL_EVENT_LABELS, hashLinkToken, type CriticalEventType } from "@/lib/criticalAuth";

// Rota PÚBLICA (sem sessão — CLAUDE.md, Segurança §1/§5): o autorizador abre, no celular, o link
// que recebeu pelo WhatsApp (POST /api/autorizacoes/[id]/enviar) e aprova ou recusa o evento.
// Autenticada exclusivamente pelo token da URL (randomBytes(32), só o hash fica no banco), que:
//  - vale só enquanto a solicitação está PENDENTE e dentro dos 15 min;
//  - é de uso único: a decisão apaga o hash, e um reenvio troca o token (o link antigo morre);
//  - nunca aceita tenantId/id/autorizador do cliente — tudo é resolvido a partir do token.
// Quem decide é o autorizador para quem o link foi enviado (targetApproverId), revalidado como
// usuário ativo e autorizador do mesmo hotel no momento da decisão.

const INVALID_LINK = "Link inválido ou já utilizado.";

function stateMessage(status: string, decidedByName: string | null): string {
  switch (status) {
    case "APROVADA":
    case "EXECUTADA":
      return `Esta solicitação já foi autorizada${decidedByName ? ` por ${decidedByName}` : ""}.`;
    case "RECUSADA":
      return `Esta solicitação já foi recusada${decidedByName ? ` por ${decidedByName}` : ""}.`;
    case "CANCELADA":
      return "O operador cancelou esta solicitação. Nada foi autorizado.";
    case "EXPIRADA":
      return "O prazo para esta autorização terminou.";
    default:
      return INVALID_LINK;
  }
}

async function limited(req: NextRequest) {
  const rate = await checkRateLimit(`critical-auth-link:${getClientIp(req)}`, { max: 30, windowMs: 60_000 });
  return rate.allowed
    ? null
    : NextResponse.json({ success: false, error: `Muitas tentativas. Tente novamente em ${rate.retryAfterSeconds}s.` }, { status: 429 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const blocked = await limited(req);
  if (blocked) return blocked;
  const { token } = await params;

  const row = await prisma.criticalAuthorization.findUnique({
    where: { linkTokenHash: hashLinkToken(token) },
    select: {
      eventType: true,
      status: true,
      summary: true,
      details: true,
      justification: true,
      requestedByName: true,
      requestedTerminal: true,
      createdAt: true,
      expiresAt: true,
      decidedByName: true,
      targetApproverId: true,
      tenant: { select: { name: true, tradeName: true, logoUrl: true } },
    },
  });
  if (!row) return NextResponse.json({ success: false, error: INVALID_LINK }, { status: 404 });

  const expired = row.status === "PENDENTE" && row.expiresAt.getTime() <= Date.now();
  if (row.status !== "PENDENTE" || expired) {
    return NextResponse.json({ success: false, error: stateMessage(expired ? "EXPIRADA" : row.status, row.decidedByName) }, { status: 410 });
  }

  const approver = row.targetApproverId
    ? await prisma.user.findFirst({ where: { id: row.targetApproverId }, select: { name: true } })
    : null;

  return NextResponse.json({
    success: true,
    hotel: { nome: row.tenant.tradeName || row.tenant.name, logoUrl: row.tenant.logoUrl },
    autorizacao: {
      evento: CRITICAL_EVENT_LABELS[row.eventType as CriticalEventType] || row.eventType,
      resumo: row.summary,
      detalhes: Array.isArray(row.details) ? Object.fromEntries(row.details as [string, string][]) : row.details || {},
      justificativa: row.justification,
      pedidoPor: row.requestedByName,
      terminal: row.requestedTerminal,
      pedidoEm: row.createdAt.toISOString(),
      expiraEm: row.expiresAt.toISOString(),
      autorizador: approver?.name || null,
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const blocked = await limited(req);
    if (blocked) return blocked;
    const { token } = await params;
    const hash = hashLinkToken(token);
    const body = await req.json().catch(() => ({}));
    const decisao = String(body.decisao || "");
    const observacao = String(body.observacao || "").trim().slice(0, 500) || null;
    if (decisao !== "APROVAR" && decisao !== "RECUSAR") {
      return NextResponse.json({ success: false, error: "Escolha aprovar ou recusar." }, { status: 400 });
    }

    const row = await prisma.criticalAuthorization.findUnique({
      where: { linkTokenHash: hash },
      select: { id: true, tenantId: true, status: true, expiresAt: true, summary: true, requestedByName: true, targetApproverId: true, decidedByName: true },
    });
    if (!row) return NextResponse.json({ success: false, error: INVALID_LINK }, { status: 404 });
    if (row.status !== "PENDENTE" || row.expiresAt.getTime() <= Date.now()) {
      const status = row.status === "PENDENTE" ? "EXPIRADA" : row.status;
      return NextResponse.json({ success: false, error: stateMessage(status, row.decidedByName) }, { status: 410 });
    }

    // O autorizador precisa continuar ativo e autorizador do mesmo hotel no momento da decisão.
    const approver = row.targetApproverId
      ? await prisma.user.findFirst({
          where: { id: row.targetApproverId, tenantId: row.tenantId, active: true, isAuthorizer: true },
          select: { id: true, name: true },
        })
      : null;
    if (!approver) {
      return NextResponse.json({ success: false, error: "Você não está mais habilitado a autorizar neste hotel." }, { status: 403 });
    }

    // Uso único: a escrita é condicionada ao hash ainda estar lá e à solicitação estar PENDENTE, e
    // apaga o hash na mesma escrita — dois toques simultâneos no link nunca decidem duas vezes.
    const decided = await prisma.criticalAuthorization.updateMany({
      where: { id: row.id, tenantId: row.tenantId, linkTokenHash: hash, status: "PENDENTE", expiresAt: { gt: new Date() } },
      data: {
        status: decisao === "APROVAR" ? "APROVADA" : "RECUSADA",
        decidedById: approver.id,
        decidedByName: approver.name,
        decisionChannel: "LINK",
        decisionNote: observacao,
        decidedAt: new Date(),
        decidedIp: getClientIp(req),
        linkTokenHash: null,
      },
    });
    if (decided.count === 0) {
      return NextResponse.json({ success: false, error: INVALID_LINK }, { status: 410 });
    }

    await logActivity({
      tenantId: row.tenantId,
      userId: approver.id,
      userName: approver.name,
      action: decisao === "APROVAR" ? "CRITICAL_AUTH_APPROVE" : "CRITICAL_AUTH_REJECT",
      description:
        `${approver.name} ${decisao === "APROVAR" ? "autorizou" : "recusou"} pelo link do WhatsApp (pedido de ${row.requestedByName}): ${row.summary}` +
        (observacao ? ` Observação: ${observacao}` : ""),
      entityType: "CRITICAL_AUTHORIZATION",
      entityId: row.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, decisao });
  } catch (error) {
    console.error("[POST /api/public/autorizacao/[token]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao registrar a decisão." }, { status: 500 });
  }
}
