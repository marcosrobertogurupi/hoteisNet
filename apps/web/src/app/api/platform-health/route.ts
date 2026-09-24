import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// GET /api/platform-health — ROTA SEM SESSÃO, autenticada por segredo próprio (CLAUDE.md §5).
//
// Consumida pelo assistente pessoal do dono da plataforma (Eugênio, repositório separado) para
// responder no WhatsApp "como está o sistema?". Só leitura, só agregados de saúde da plataforma:
// versão no ar, banco, sinal de vida do worker, egress, IA, alertas e integrações com falha. Nenhum
// dado de hóspede, reserva ou financeiro de tenant — no máximo o nome do hotel ao lado de um número.
//
// Autenticação: `Authorization: Bearer <PLATFORM_HEALTH_TOKEN>`, comparado timing-safe. Sem a env
// configurada, a rota recusa tudo. Chamada sob demanda (não é polling), mas ainda assim cada
// consulta traz só colunas agregadas (regra de egress).

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// O worker grava um snapshot de ocupação por tenant a cada hora cheia (apps/worker/src/index.ts).
// Mais de 70 min sem snapshot novo = worker parado (ou sem nenhum tenant com quartos).
const WORKER_SILENCIOSO_MIN = 70;
// O agente fiscal do PDV manda heartbeat a cada poucos minutos enquanto o caixa está ligado.
const PDV_SILENCIOSO_MIN = 15;
const TOP = 3;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = process.env.PLATFORM_HEALTH_TOKEN || "";
  const received = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !received || !safeEqual(received, expected)) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  // tenant_egress_daily usa o dia em UTC (lib/egressMeter.ts → todayUtcDate); "hoje" aqui segue o mesmo.
  const todayUtc = new Date(new Date(now).toISOString().slice(0, 10));

  const dbStart = Date.now();
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const dbLatencyMs = Date.now() - dbStart;
  if (!dbOk) {
    return NextResponse.json({ success: true, banco: { ok: false, latenciaMs: dbLatencyMs }, versao: versao() });
  }

  const [
    ultimoSnapshot,
    egressHoje,
    egress7d,
    egressTopHoje,
    ia24h,
    iaTop24h,
    alertas24h,
    alertasPresos,
    reviewsFalhas24h,
    whatsappDesconectados,
    pdvSilenciosos,
  ] = await Promise.all([
    prisma.roomOccupancySnapshot.aggregate({ _max: { snapshotAt: true } }),
    prisma.tenantEgressDaily.aggregate({ where: { day: todayUtc }, _sum: { responseBytes: true, queryCount: true } }),
    prisma.tenantEgressDaily.aggregate({ where: { day: { gte: since7d } }, _sum: { responseBytes: true } }),
    prisma.tenantEgressDaily.groupBy({
      by: ["tenantId"],
      where: { day: todayUtc },
      _sum: { responseBytes: true },
      orderBy: { _sum: { responseBytes: "desc" } },
      take: TOP,
    }),
    prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: since24h } }, _count: { _all: true }, _sum: { totalCostUsd: true } }),
    prisma.aIUsageLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: since24h } },
      _sum: { totalCostUsd: true },
      orderBy: { _sum: { totalCostUsd: "desc" } },
      take: TOP,
    }),
    prisma.operationalAlertLog.groupBy({
      by: ["issueType"],
      where: { lastAlertedAt: { gte: since24h } },
      _count: { _all: true },
    }),
    // Alerta criado mas cujo WhatsApp nunca saiu (ver OperationalAlertLog.notifiedAt).
    prisma.operationalAlertLog.count({ where: { notifiedAt: null, firstAlertedAt: { lt: new Date(now - 30 * 60 * 1000) } } }),
    prisma.reviewSyncJob.count({ where: { status: "failed", startedAt: { gte: since24h } } }),
    prisma.uazapiSetting.findMany({
      // Só instâncias já configuradas (com token): hotel que nunca ligou o WhatsApp não é "caído".
      where: { connected: false, instanceToken: { not: "" }, tenant: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] } } },
      select: { tenantId: true },
      take: 20,
    }),
    prisma.pdvTerminal.findMany({
      where: {
        active: true,
        lastHeartbeat: { not: null, lt: new Date(now - PDV_SILENCIOSO_MIN * 60 * 1000) },
        tenant: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] } },
      },
      select: { tenantId: true, name: true, lastHeartbeat: true },
      take: 20,
    }),
  ]);

  const tenantIds = new Set<string>([
    ...egressTopHoje.map((e) => e.tenantId),
    ...iaTop24h.map((i) => i.tenantId),
    ...whatsappDesconectados.map((w) => w.tenantId),
    ...pdvSilenciosos.map((p) => p.tenantId),
  ]);
  const tenants = tenantIds.size
    ? await prisma.tenant.findMany({ where: { id: { in: [...tenantIds] } }, select: { id: true, name: true, tradeName: true } })
    : [];
  const nome = new Map(tenants.map((t) => [t.id, t.tradeName || t.name]));
  const nomeDe = (id: string) => nome.get(id) || id;

  const ultimoSnapshotAt = ultimoSnapshot._max.snapshotAt;
  const workerMinutos = ultimoSnapshotAt ? Math.round((now - ultimoSnapshotAt.getTime()) / 60000) : null;

  return NextResponse.json({
    success: true,
    geradoEm: new Date(now).toISOString(),
    versao: versao(),
    banco: { ok: true, latenciaMs: dbLatencyMs },
    worker: {
      ultimoSnapshotEm: ultimoSnapshotAt?.toISOString() ?? null,
      minutosDesdeUltimoSnapshot: workerMinutos,
      ok: workerMinutos !== null && workerMinutos <= WORKER_SILENCIOSO_MIN,
    },
    egress: {
      hojeUtcMb: mb(egressHoje._sum.responseBytes),
      hojeConsultas: egressHoje._sum.queryCount ?? 0,
      ultimos7diasMb: mb(egress7d._sum.responseBytes),
      topHoje: egressTopHoje.map((e) => ({ hotel: nomeDe(e.tenantId), mb: mb(e._sum.responseBytes) })),
    },
    ia24h: {
      chamadas: ia24h._count._all,
      custoUsd: round2(Number(ia24h._sum.totalCostUsd ?? 0)),
      top: iaTop24h.map((i) => ({ hotel: nomeDe(i.tenantId), custoUsd: round2(Number(i._sum.totalCostUsd ?? 0)) })),
    },
    alertasOperacionais24h: Object.fromEntries(alertas24h.map((a) => [a.issueType, a._count._all])),
    alertasSemEnvio: alertasPresos,
    reviewsSyncFalhas24h: reviewsFalhas24h,
    whatsappDesconectados: whatsappDesconectados.map((w) => nomeDe(w.tenantId)),
    pdvSemSinal: pdvSilenciosos.map((p) => ({
      hotel: nomeDe(p.tenantId),
      caixa: p.name,
      minutos: Math.round((now - p.lastHeartbeat!.getTime()) / 60000),
    })),
  });
}

function versao() {
  return {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    mensagem: (process.env.VERCEL_GIT_COMMIT_MESSAGE || "").split("\n")[0].slice(0, 120) || null,
    ambiente: process.env.VERCEL_ENV || "local",
  };
}

function mb(bytes: bigint | null | undefined): number {
  return round2(Number(bytes ?? 0) / (1024 * 1024));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
