import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";
import { computeMrr } from "@/lib/saasBilling";

// GET /api/admin/dashboard — visão geral do SaaS para a home do painel. Leitura: qualquer papel
// de plataforma. Números reais, sem mock.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [mrr, byStatus, newThisMonth, aiByFeature, aiTotals, openTickets, egressTop, cpfTotals] = await Promise.all([
    computeMrr(),
    prisma.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.tenant.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.aIUsageLog.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since30d } },
      _sum: { tokensInput: true, tokensOutput: true, totalCostUsd: true },
    }),
    prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since30d } },
      _sum: { tokensInput: true, tokensOutput: true, totalCostUsd: true },
    }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }).catch(() => 0),
    prisma.tenantEgressDaily.groupBy({
      by: ["tenantId"],
      where: { day: { gte: since30d } },
      _sum: { responseBytes: true, queryCount: true },
      orderBy: { _sum: { responseBytes: "desc" } },
      take: 5,
    }),
    prisma.tenant.aggregate({ _sum: { cpfQueryUsed: true, cpfQueryQuotaMonthly: true } }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of byStatus) statusCounts[r.status] = r._count._all;

  // Nomes dos tenants do top de egress.
  const egressTenantIds = egressTop.map((e) => e.tenantId);
  const egressTenants = egressTenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: egressTenantIds } },
        select: { id: true, name: true, tradeName: true },
      })
    : [];
  const nameById = new Map(egressTenants.map((t) => [t.id, t.tradeName || t.name]));

  return NextResponse.json({
    success: true,
    mrr,
    arr: Math.round(mrr * 12 * 100) / 100,
    tenantsByStatus: statusCounts,
    tenantsTotal: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    newThisMonth,
    openTickets,
    ai30d: {
      tokens: (aiTotals._sum.tokensInput ?? 0) + (aiTotals._sum.tokensOutput ?? 0),
      costUsd: Number(aiTotals._sum.totalCostUsd ?? 0),
      byFeature: aiByFeature
        .map((f) => ({
          feature: f.feature,
          tokens: (f._sum.tokensInput ?? 0) + (f._sum.tokensOutput ?? 0),
          costUsd: Number(f._sum.totalCostUsd ?? 0),
        }))
        .sort((a, b) => b.tokens - a.tokens),
    },
    cpf: {
      used: cpfTotals._sum.cpfQueryUsed ?? 0,
      quota: cpfTotals._sum.cpfQueryQuotaMonthly ?? 0,
    },
    egressTop30d: egressTop.map((e) => ({
      tenantId: e.tenantId,
      tenantName: nameById.get(e.tenantId) || e.tenantId,
      bytes: Number(e._sum.responseBytes ?? 0),
      queries: e._sum.queryCount ?? 0,
    })),
  });
}
