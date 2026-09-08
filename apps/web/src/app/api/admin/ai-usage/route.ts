import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";
import { getAiBillingConfig, billFromCostUsd } from "@/lib/aiAgent/billing";

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

  const billingConfig = await getAiBillingConfig();

  const [byFeature, byTenantPeriod, byTenantMonth, tenants] = await Promise.all([
    prisma.aIUsageLog.groupBy({
      by: ["feature", "model"],
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
      const costPeriodUsd = Number(p?._sum.totalCostUsd ?? 0);
      const bill = billFromCostUsd(costPeriodUsd, billingConfig);
      return {
        tenantId: t.id,
        tenantName: t.tradeName || t.name,
        blocked: t.aiAgentSettings?.blocked ?? false,
        tokensPeriod: (p?._sum.tokensInput ?? 0) + (p?._sum.tokensOutput ?? 0),
        costPeriodUsd,
        costPeriodBrl: bill.costBrl,
        pricePeriodBrl: bill.priceBrl,
        marginPeriodBrl: bill.marginBrl,
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
    // Agrupado por recurso; cada recurso lista os modelos que rodaram no período (normalmente 1).
    byFeature: Object.values(
      byFeature.reduce<Record<string, { feature: string; requests: number; tokens: number; costUsd: number; models: { model: string; tokens: number }[] }>>(
        (acc, row) => {
          const tokens = (row._sum.tokensInput ?? 0) + (row._sum.tokensOutput ?? 0);
          const entry = (acc[row.feature] ??= { feature: row.feature, requests: 0, tokens: 0, costUsd: 0, models: [] });
          entry.requests += row._count._all;
          entry.tokens += tokens;
          entry.costUsd += Number(row._sum.totalCostUsd ?? 0);
          entry.models.push({ model: row.model, tokens });
          return acc;
        },
        {}
      )
    )
      .map((e) => ({ ...e, models: e.models.sort((a, b) => b.tokens - a.tokens) }))
      .sort((a, b) => b.tokens - a.tokens),
    perTenant,
    billingConfig,
    totals: (() => {
      const costUsd = Math.round(perTenant.reduce((s, t) => s + t.costPeriodUsd, 0) * 1e6) / 1e6;
      const bill = billFromCostUsd(costUsd, billingConfig);
      return {
        tokens: perTenant.reduce((s, t) => s + t.tokensPeriod, 0),
        costUsd,
        costBrl: bill.costBrl,
        priceBrl: bill.priceBrl,
        marginBrl: bill.marginBrl,
      };
    })(),
  });
}
