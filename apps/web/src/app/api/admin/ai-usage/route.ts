import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";

const DEFAULT_AI_QUOTA = 50000;

// GET /api/admin/ai-usage?days=30 — telemetria de IA por assinante e por recurso. Leitura:
// qualquer papel de plataforma. "Uso no mês" (para comparar com a cota) é sempre o mês corrente.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [byFeature, byTenantPeriod, byTenantMonth, tenants] = await Promise.all([
    prisma.aIUsageLog.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since } },
      _sum: { tokensInput: true, tokensOutput: true, totalCostUsd: true },
      _count: { _all: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: since } },
      _sum: { tokensInput: true, tokensOutput: true, totalCostUsd: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: monthStart } },
      _sum: { tokensInput: true, tokensOutput: true },
    }),
    prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        tradeName: true,
        aiAgentSettings: { select: { tokenQuotaOverride: true, blocked: true } },
        subscriptions: {
          where: { active: true },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { aiTokenQuota: true } } },
        },
      },
    }),
  ]);

  const periodByTenant = new Map(byTenantPeriod.map((r) => [r.tenantId, r]));
  const monthByTenant = new Map(byTenantMonth.map((r) => [r.tenantId, r]));

  const perTenant = tenants
    .map((t) => {
      const p = periodByTenant.get(t.id);
      const m = monthByTenant.get(t.id);
      const usedMonth = (m?._sum.tokensInput ?? 0) + (m?._sum.tokensOutput ?? 0);
      const quota =
        t.aiAgentSettings?.tokenQuotaOverride ?? t.subscriptions[0]?.plan?.aiTokenQuota ?? DEFAULT_AI_QUOTA;
      const pct = quota > 0 ? Math.round((usedMonth / quota) * 100) : 0;
      return {
        tenantId: t.id,
        tenantName: t.tradeName || t.name,
        blocked: t.aiAgentSettings?.blocked ?? false,
        tokensPeriod: (p?._sum.tokensInput ?? 0) + (p?._sum.tokensOutput ?? 0),
        costPeriodUsd: Number(p?._sum.totalCostUsd ?? 0),
        usedMonth,
        quota,
        pct,
        status: pct >= 100 ? "EXCEEDED" : pct >= 80 ? "WARNING" : "OK",
      };
    })
    .sort((a, b) => b.tokensPeriod - a.tokensPeriod);

  return NextResponse.json({
    success: true,
    days,
    byFeature: byFeature
      .map((f) => ({
        feature: f.feature,
        requests: f._count._all,
        tokens: (f._sum.tokensInput ?? 0) + (f._sum.tokensOutput ?? 0),
        costUsd: Number(f._sum.totalCostUsd ?? 0),
      }))
      .sort((a, b) => b.tokens - a.tokens),
    perTenant,
    totals: {
      tokens: perTenant.reduce((s, t) => s + t.tokensPeriod, 0),
      costUsd: Math.round(perTenant.reduce((s, t) => s + t.costPeriodUsd, 0) * 1e6) / 1e6,
    },
  });
}
