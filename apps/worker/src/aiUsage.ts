// Telemetria de uso de IA no worker (agente operacional). Espelha
// apps/web/src/lib/aiAgent/{features,pricing,modelResolver,usage}.ts — o worker é CJS puro e não
// importa apps/web, então a lógica é duplicada de propósito (mesmo padrão do resto deste app).
//
// Se mudar uma chave de recurso, um preço-fallback ou a regra de resolução de modelo aqui, mude
// no lado do apps/web também.
import type { PrismaClient } from "@prisma/client";

// Recursos de IA do worker (ver apps/web/src/lib/aiAgent/features.ts para os do apps/web).
export const WORKER_AI_FEATURES = {
  OPERATIONAL_MONITORING: "operational_monitoring",
  OPERATIONAL_KNOWLEDGE_DRIFT: "operational_knowledge_drift",
} as const;
export type WorkerAiFeature = (typeof WORKER_AI_FEATURES)[keyof typeof WORKER_AI_FEATURES];

export const AI_MODEL_FALLBACK = "gemini-2.5-flash";

// USD por 1M de tokens — usado só se o modelo não estiver em ai_model_prices (o seed cobre os usados).
const FALLBACK_USD_PER_M = { input: 0.3, cachedInput: 0.075, output: 2.5 };

// usageMetadata da resposta REST do Gemini → contrato de logAiUsage.
// promptTokenCount inclui cache; candidatesTokenCount NÃO inclui thoughts (por isso somamos).
export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function readGeminiUsage(meta: GeminiUsageMetadata | undefined | null) {
  const promptTokens = Math.max(0, Math.round(meta?.promptTokenCount ?? 0));
  const cached = Math.max(0, Math.round(meta?.cachedContentTokenCount ?? 0));
  const candidates = Math.max(0, Math.round(meta?.candidatesTokenCount ?? 0));
  const thoughts = Math.max(0, Math.round(meta?.thoughtsTokenCount ?? 0));
  return {
    tokensInput: promptTokens,
    tokensCachedInput: cached,
    // saída faturável = texto + thinking
    tokensOutput: candidates + thoughts,
    tokensReasoning: thoughts,
  };
}

export async function resolveWorkerAiModel(
  prisma: PrismaClient,
  feature: WorkerAiFeature,
  tenantId: string
): Promise<string> {
  const override = await prisma.tenantAiModelOverride.findUnique({
    where: { tenantId_feature: { tenantId, feature } },
    select: { model: true },
  });
  if (override?.model) return override.model;
  const def = await prisma.aiModelDefault.findUnique({ where: { feature }, select: { model: true } });
  return def?.model || AI_MODEL_FALLBACK;
}

async function computeCostUsd(
  prisma: PrismaClient,
  model: string,
  tokensInput: number,
  tokensCachedInput: number,
  tokensOutput: number
): Promise<number> {
  const price = await prisma.aiModelPrice.findFirst({
    where: { model, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { inputPerMTokenUsd: true, cachedInputPerMTokenUsd: true, outputPerMTokenUsd: true },
  });
  const perM = price
    ? {
        input: Number(price.inputPerMTokenUsd),
        cachedInput: Number(price.cachedInputPerMTokenUsd),
        output: Number(price.outputPerMTokenUsd),
      }
    : FALLBACK_USD_PER_M;
  const uncachedInput = Math.max(0, tokensInput - tokensCachedInput);
  const cost =
    (uncachedInput * perM.input + tokensCachedInput * perM.cachedInput + tokensOutput * perM.output) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}

export async function logWorkerAiUsage(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    feature: WorkerAiFeature;
    model: string;
    tokensInput: number;
    tokensOutput: number;
    tokensCachedInput?: number;
    tokensReasoning?: number;
  }
): Promise<void> {
  const tokensCachedInput = Math.max(0, params.tokensCachedInput ?? 0);
  const tokensReasoning = Math.max(0, params.tokensReasoning ?? 0);
  try {
    const totalCostUsd = await computeCostUsd(
      prisma,
      params.model,
      params.tokensInput,
      tokensCachedInput,
      params.tokensOutput
    );
    await prisma.aIUsageLog.create({
      data: {
        tenantId: params.tenantId,
        feature: params.feature,
        model: params.model,
        tokensInput: params.tokensInput,
        tokensCachedInput,
        tokensOutput: params.tokensOutput,
        tokensReasoning,
        stepCount: 1,
        totalCostUsd,
      },
    });
  } catch (err: any) {
    // Telemetria nunca derruba o ciclo do agente operacional.
    console.error("[worker/aiUsage] falha ao registrar uso de IA:", err?.message || err);
  }
}
