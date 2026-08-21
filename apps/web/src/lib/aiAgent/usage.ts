// Controle de cota e registro de uso de IA por tenant. A cota (SaaSPlan.aiTokenQuota) e o modelo
// usado são definidos globalmente pelo admin master — o assinante nunca escolhe nem vê o modelo
// ou a chave do AI Gateway, só se beneficia ou é bloqueado pela cota do próprio plano.
import { prisma } from "@/lib/prisma";

// Ciclo de cota = mês corrente (calendário), simples e alinhado ao "refresh mensal" já usado para
// a cota de consulta de CPF (Tenant.cpfQueryCycleStart) — sem introduzir um segundo conceito de ciclo.
function currentCycleStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getRemainingAiQuota(tenantId: string): Promise<{ quota: number; used: number; remaining: number }> {
  const subscription = await prisma.saASSubscription.findFirst({
    where: { tenantId, active: true },
    include: { plan: { select: { aiTokenQuota: true } } },
    orderBy: { startDate: "desc" },
  });
  const quota = subscription?.plan.aiTokenQuota ?? 0;

  const cycleStart = currentCycleStart();
  const usage = await prisma.aIUsageLog.aggregate({
    where: { tenantId, createdAt: { gte: cycleStart } },
    _sum: { tokensInput: true, tokensOutput: true },
  });
  const used = (usage._sum.tokensInput || 0) + (usage._sum.tokensOutput || 0);

  return { quota, used, remaining: Math.max(0, quota - used) };
}

export async function hasAiQuotaAvailable(tenantId: string): Promise<boolean> {
  const { remaining } = await getRemainingAiQuota(tenantId);
  return remaining > 0;
}

// Preço aproximado do gemini-3.7-flash via AI Gateway, em USD por token — usado só para o registro
// de custo em AIUsageLog (telemetria), não afeta o bloqueio por cota (que é em tokens, não em $).
const INPUT_COST_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 0.6 / 1_000_000;

export async function logAiUsage(params: {
  tenantId: string;
  feature: string;
  tokensInput: number;
  tokensOutput: number;
}): Promise<void> {
  const totalCostUsd = params.tokensInput * INPUT_COST_PER_TOKEN + params.tokensOutput * OUTPUT_COST_PER_TOKEN;
  await prisma.aIUsageLog.create({
    data: {
      tenantId: params.tenantId,
      feature: params.feature,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      totalCostUsd,
    },
  });
}
