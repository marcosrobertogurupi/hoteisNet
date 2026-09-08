// Resolve qual modelo de IA usar para um recurso, na ordem:
//   1. override do assinante para aquele recurso (TenantAiModelOverride)
//   2. default de plataforma para o recurso (AiModelDefault)
//   3. fallback do código (mesmo modelo que era hardcoded antes)
//
// O modelo resolvido tem que ser passado tanto para a chamada de IA quanto para logAiUsage, para o
// custo bater com o que rodou.
import { prisma } from "@/lib/prisma";
import type { AiFeature } from "@/lib/aiAgent/features";

export const AI_MODEL_FALLBACK = "gemini-2.5-flash";

export async function resolveAiModel(feature: AiFeature, tenantId: string | null): Promise<string> {
  if (tenantId) {
    const override = await prisma.tenantAiModelOverride.findUnique({
      where: { tenantId_feature: { tenantId, feature } },
      select: { model: true },
    });
    if (override?.model) return override.model;
  }
  const def = await prisma.aiModelDefault.findUnique({ where: { feature }, select: { model: true } });
  return def?.model || AI_MODEL_FALLBACK;
}
