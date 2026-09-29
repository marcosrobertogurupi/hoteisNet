import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isAdminRole } from "@/lib/auth";
import { parseBrasiliaDateTime } from "@/lib/brasiliaDate";
import { CRITICAL_EVENT_LABELS, type CriticalEventType } from "@/lib/criticalAuth";

// GET /api/autorizacoes — consulta da trilha de autorizações de eventos críticos (Relatórios ›
// Autorizações). Só administradores e autorizadores do hotel veem — é a auditoria de quem pediu,
// quem autorizou/recusou, por qual canal e quando. Somente leitura: não existe rota que edite ou
// apague estas linhas.
//
// Filtros (query): de / ate (YYYY-MM-DD, horário de Brasília; padrão = últimos 30 dias), evento,
// status, q (busca em quem pediu / quem decidiu / resumo). No máximo 200 linhas, mais recentes
// primeiro, só com as colunas exibidas (CLAUDE.md ⚡ §1).
const MAX_ROWS = 200;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    if (!isAdminRole(session.role)) {
      const me = await prisma.user.findFirst({
        where: { id: session.userId, tenantId, active: true },
        select: { isAuthorizer: true },
      });
      if (!me?.isAuthorizer) {
        return NextResponse.json(
          { success: false, error: "Apenas administradores e autorizadores podem consultar as autorizações." },
          { status: 403 }
        );
      }
    }

    const sp = new URL(req.url).searchParams;
    const de = sp.get("de");
    const ate = sp.get("ate");
    const evento = sp.get("evento");
    const status = sp.get("status");
    const q = (sp.get("q") || "").trim().slice(0, 80);

    const from = de ? parseBrasiliaDateTime(de, "00:00") : new Date(Date.now() - 30 * 86_400_000);
    const to = ate ? new Date(parseBrasiliaDateTime(ate, "23:59").getTime() + 60_000) : new Date(Date.now() + 60_000);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ success: false, error: "Período inválido." }, { status: 400 });
    }

    const rows = await prisma.criticalAuthorization.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lt: to },
        ...(evento && evento in CRITICAL_EVENT_LABELS ? { eventType: evento } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { requestedByName: { contains: q, mode: "insensitive" as const } },
                { decidedByName: { contains: q, mode: "insensitive" as const } },
                { summary: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        status: true,
        summary: true,
        details: true,
        justification: true,
        requestedByName: true,
        requestedTerminal: true,
        decidedByName: true,
        decisionChannel: true,
        decisionNote: true,
        decidedAt: true,
        executedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      truncado: rows.length > MAX_ROWS,
      autorizacoes: rows.slice(0, MAX_ROWS).map((r) => ({
        id: r.id,
        criadaEm: r.createdAt.toISOString(),
        evento: CRITICAL_EVENT_LABELS[r.eventType as CriticalEventType] || r.eventType,
        status: r.status,
        resumo: r.summary,
        detalhes: Array.isArray(r.details) ? (r.details as [string, string][]) : Object.entries((r.details as Record<string, string>) || {}),
        justificativa: r.justification,
        pedidoPor: r.requestedByName,
        terminal: r.requestedTerminal,
        decididoPor: r.decidedByName,
        canal: r.decisionChannel,
        observacao: r.decisionNote,
        decididaEm: r.decidedAt?.toISOString() ?? null,
        executadaEm: r.executedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/autorizacoes] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao consultar as autorizações." }, { status: 500 });
  }
}
