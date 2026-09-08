import { PrismaClient } from "@prisma/client";
import { sendPlatformWhatsApp } from "./uazapiSend";

const prisma = new PrismaClient();
const DEFAULT_AI_QUOTA = 50000;

// Monitor da plataforma — checagens determinísticas (sem IA, ver memória
// background-agent-checks-must-be-token-free). Hoje: assinante estourou a cota mensal de tokens
// de IA. Cada estouro gera UM alerta por mês (dedup via PlatformAuditLog) para o número da
// plataforma (PLATFORM_ALERT_PHONE) + registro na trilha de auditoria.

export async function runSaasMonitor(): Promise<void> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const alertPhone = process.env.PLATFORM_ALERT_PHONE || "";

  const [usageByTenant, tenants, alreadyAlerted] = await Promise.all([
    prisma.aIUsageLog.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: monthStart } },
      _sum: { tokensInput: true, tokensOutput: true },
    }),
    prisma.tenant.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] } },
      select: {
        id: true,
        name: true,
        tradeName: true,
        aiAgentSettings: { select: { tokenQuotaOverride: true } },
        subscriptions: {
          where: { active: true },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { aiTokenQuota: true } } },
        },
      },
    }),
    prisma.platformAuditLog.findMany({
      where: { action: "AI_QUOTA_EXCEEDED_ALERT", createdAt: { gte: monthStart } },
      select: { targetTenantId: true },
    }),
  ]);

  const usedByTenant = new Map(
    usageByTenant.map((u) => [u.tenantId, (u._sum.tokensInput ?? 0) + (u._sum.tokensOutput ?? 0)])
  );
  const alertedThisMonth = new Set(alreadyAlerted.map((a) => a.targetTenantId));

  for (const t of tenants) {
    if (alertedThisMonth.has(t.id)) continue;
    const used = usedByTenant.get(t.id) ?? 0;
    const quota =
      t.aiAgentSettings?.tokenQuotaOverride ?? t.subscriptions[0]?.plan?.aiTokenQuota ?? DEFAULT_AI_QUOTA;
    if (quota <= 0 || used <= quota) continue;

    const label = t.tradeName || t.name;
    try {
      await prisma.platformAuditLog.create({
        data: {
          actorId: "saas-monitor",
          actorName: "Monitor da plataforma",
          actorRole: "SYSTEM",
          action: "AI_QUOTA_EXCEEDED_ALERT",
          description: `${label} estourou a cota mensal de IA: ${used.toLocaleString("pt-BR")} / ${quota.toLocaleString("pt-BR")} tokens.`,
          targetTenantId: t.id,
          entityType: "Tenant",
          entityId: t.id,
          details: { used, quota },
        },
      });
      if (alertPhone) {
        await sendPlatformWhatsApp(
          alertPhone,
          `⚠️ *Hoteis.Net — cota de IA estourada*\n\nO assinante *${label}* já consumiu ${used.toLocaleString("pt-BR")} de ${quota.toLocaleString("pt-BR")} tokens de IA neste mês. Avalie ajustar a cota ou o plano no painel.`
        );
      }
      console.log(`[monitor] alerta de cota de IA: ${label} (${used}/${quota})`);
    } catch (err: any) {
      console.error(`[monitor] erro ao alertar cota de IA de ${label}:`, err?.message || err);
    }
  }
}
