// Controle de cota e registro de uso de IA por tenant. A cota (SaaSPlan.aiTokenQuota) e o modelo
// usado são definidos globalmente pelo admin master — o assinante nunca escolhe nem vê o modelo
// ou a chave do AI Gateway, só se beneficia ou é bloqueado pela cota do próprio plano.
import { prisma } from "@/lib/prisma";
import { computeAiCostUsd } from "@/lib/aiAgent/pricing";

// Ciclo de cota = mês corrente (calendário), simples e alinhado ao "refresh mensal" já usado para
// a cota de consulta de CPF (Tenant.cpfQueryCycleStart) — sem introduzir um segundo conceito de ciclo.
function currentCycleStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getRemainingAiQuota(tenantId: string): Promise<{ quota: number; used: number; remaining: number; blocked: boolean }> {
  const [subscription, agentSetting] = await Promise.all([
    prisma.saASSubscription.findFirst({
      where: { tenantId, active: true },
      include: { plan: { select: { aiTokenQuota: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.aIAgentSetting.findUnique({ where: { tenantId }, select: { tokenQuotaOverride: true, blocked: true } }),
  ]);

  // tokenQuotaOverride é um controle exclusivo do admin master — sobrescreve a cota do plano
  // quando definido (ver AIAgentSetting no schema).
  const quota = agentSetting?.tokenQuotaOverride ?? subscription?.plan.aiTokenQuota ?? 0;

  const cycleStart = currentCycleStart();
  const usage = await prisma.aIUsageLog.aggregate({
    where: { tenantId, createdAt: { gte: cycleStart } },
    _sum: { tokensInput: true, tokensOutput: true },
  });
  const used = (usage._sum.tokensInput || 0) + (usage._sum.tokensOutput || 0);

  return { quota, used, remaining: Math.max(0, quota - used), blocked: !!agentSetting?.blocked };
}

export async function hasAiQuotaAvailable(tenantId: string): Promise<boolean> {
  const { remaining, blocked } = await getRemainingAiQuota(tenantId);
  return !blocked && remaining > 0;
}

// Registra o uso de uma chamada de IA. O custo (AiModelPrice vigente) é só para telemetria/fatura —
// não afeta o bloqueio por cota, que continua sendo em tokens (tokensInput + tokensOutput).
//
// Contrato dos campos de token (para o custo bater com o provedor):
//  - tokensInput: total de tokens de entrada (inclui os lidos de cache).
//  - tokensCachedInput: subconjunto de tokensInput lido de cache (cobrado mais barato). 0 se não houve.
//  - tokensOutput: total de saída, JÁ incluindo os tokens de reasoning/thinking.
//  - tokensReasoning: subconjunto de tokensOutput gasto em thinking (informativo, não recobrar).
export async function logAiUsage(params: {
  tenantId: string;
  feature: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput?: number;
  tokensReasoning?: number;
  stepCount?: number;
}): Promise<void> {
  const tokensCachedInput = Math.max(0, params.tokensCachedInput ?? 0);
  const tokensReasoning = Math.max(0, params.tokensReasoning ?? 0);
  const totalCostUsd = await computeAiCostUsd({
    model: params.model,
    tokensInput: params.tokensInput,
    tokensCachedInput,
    tokensOutput: params.tokensOutput,
  });
  await prisma.aIUsageLog.create({
    data: {
      tenantId: params.tenantId,
      feature: params.feature,
      model: params.model,
      tokensInput: params.tokensInput,
      tokensCachedInput,
      tokensOutput: params.tokensOutput,
      tokensReasoning,
      stepCount: Math.max(1, params.stepCount ?? 1),
      totalCostUsd,
    },
  });
}
