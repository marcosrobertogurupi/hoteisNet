// Orquestra uma decisão do Jev: lê o modo do recurso (OFF/SHADOW/ACTIVE, definido pelo admin
// master), chama o Jev, registra o custo em AIUsageLog (valor exato do OpenRouter) e a decisão em
// JevDecisionLog. Nunca lança — falha do Jev = fluxo atual segue.
import type { JevMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAiUsage } from "@/lib/aiAgent/usage";
import { callJev, JEV_DEFAULT_MODEL, type JevAnswer, type JevQuestion } from "@/lib/jev/client";
import { JEV_FEATURE_DEFS, type JevFeature } from "@/lib/jev/features";

// Cache curto do modo por recurso: evita 1 leitura no banco por mensagem de WhatsApp (egress —
// CLAUDE.md ⚡). Mudança no admin leva no máximo este tempo para valer em cada instância.
const SETTING_TTL_MS = 60_000;
const settingCache = new Map<string, { mode: JevMode; model: string; at: number }>();

export async function getJevSetting(feature: JevFeature): Promise<{ mode: JevMode; model: string }> {
  const cached = settingCache.get(feature);
  if (cached && Date.now() - cached.at < SETTING_TTL_MS) return cached;
  try {
    const row = await prisma.jevFeatureSetting.findUnique({ where: { feature }, select: { mode: true, model: true } });
    let mode: JevMode = row?.mode ?? "OFF";
    // ACTIVE só vale onde o código já sabe agir; senão degrada para SHADOW.
    if (mode === "ACTIVE" && !JEV_FEATURE_DEFS[feature].activeAvailable) mode = "SHADOW";
    const value = { mode, model: row?.model || JEV_DEFAULT_MODEL, at: Date.now() };
    settingCache.set(feature, value);
    return value;
  } catch {
    return { mode: "OFF", model: JEV_DEFAULT_MODEL };
  }
}

export type JevDecisionOutcome = {
  mode: JevMode;
  logId: string | null;
  answers: Record<string, JevAnswer> | null;
};

export async function runJevDecision(params: {
  tenantId: string;
  feature: JevFeature;
  state: unknown;
  questions: Record<string, JevQuestion>;
  subjectRef?: string | null;
  // Converte as respostas numa decisão nomeada (ex.: "escalate"/"farewell"/"agent") para o log.
  decide?: (answers: Record<string, JevAnswer>) => string;
  timeoutMs?: number;
}): Promise<JevDecisionOutcome | null> {
  try {
    const { mode, model } = await getJevSetting(params.feature);
    if (mode === "OFF") return null;

    const result = await callJev({ state: params.state, questions: params.questions, model, timeoutMs: params.timeoutMs });

    if (result.ok) {
      await logAiUsage({
        tenantId: params.tenantId,
        feature: params.feature,
        model,
        provider: "openrouter",
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      }).catch((err) => console.error("[jev] falha ao registrar uso:", err?.message || err));
    }

    const decision = result.ok && params.decide ? params.decide(result.answers) : null;
    const log = await prisma.jevDecisionLog
      .create({
        data: {
          tenantId: params.tenantId,
          feature: params.feature,
          mode,
          subjectRef: params.subjectRef ?? null,
          answers: result.ok ? (result.answers as object) : undefined,
          decision,
          durationMs: result.durationMs,
          costUsd: result.ok ? Math.round(result.costUsd * 1e8) / 1e8 : 0,
          error: result.ok ? null : result.error.slice(0, 500),
        },
        select: { id: true },
      })
      .catch((err) => {
        console.error("[jev] falha ao registrar decisão:", err?.message || err);
        return null;
      });

    if (!result.ok) console.error(`[jev] ${params.feature} falhou — tenant=${params.tenantId}: ${result.error}`);
    return { mode, logId: log?.id ?? null, answers: result.ok ? result.answers : null };
  } catch (err) {
    console.error("[jev] erro inesperado:", (err as Error)?.message || err);
    return null;
  }
}

// Registra o que o sistema de fato fez depois (modo sombra: desfecho do agente) — base para
// comparar com a decisão do Jev e calibrar os limites antes de ligar o ACTIVE.
export async function recordJevObservedOutcome(tenantId: string, logId: string | null | undefined, outcome: string) {
  if (!logId) return;
  await prisma.jevDecisionLog
    .updateMany({ where: { id: logId, tenantId }, data: { observedOutcome: outcome.slice(0, 100) } })
    .catch((err) => console.error("[jev] falha ao registrar desfecho:", err?.message || err));
}
