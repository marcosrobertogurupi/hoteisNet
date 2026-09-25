// Cliente HTTP do Jev (TypeSafe) via OpenRouter — espelho de apps/web/src/lib/jev/client.ts (o
// worker é CJS puro e não importa apps/web). Mude os dois juntos.
// Jev é um modelo de DECISÃO: não escreve texto; responde Choice/Score/Noul com probabilidades.
// Nunca lança: falha volta como { ok: false } para o chamador seguir o fluxo atual.
import type { PrismaClient, JevMode } from "@prisma/client";
import { logWorkerAiUsage } from "./aiUsage";

export const JEV_DEFAULT_MODEL = "typesafe/jev-1.13";
const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, string> }
  | { type: "noul"; noul: number };

export type JevResult =
  | { ok: true; answers: Record<string, JevAnswer>; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; model: string }
  | { ok: false; error: string; durationMs: number };

export async function callJev(params: {
  state: unknown;
  questions: Record<string, JevQuestion>;
  model?: string;
  timeoutMs?: number;
}): Promise<JevResult> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY não configurada.", durationMs: 0 };

  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "HoteisNet",
      },
      body: JSON.stringify({
        model: params.model || JEV_DEFAULT_MODEL,
        state: params.state,
        questions: params.questions,
        provider: { zdr: true, data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 5000),
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `Jev respondeu ${response.status}: ${text.slice(0, 500)}`, durationMs };

    const json: any = JSON.parse(text);
    if (!json?.answers || typeof json.answers !== "object") return { ok: false, error: "Resposta do Jev sem answers.", durationMs };
    return {
      ok: true,
      answers: json.answers,
      tokensInput: Math.max(0, Math.round(json.usage?.input_tokens ?? 0)),
      tokensOutput: Math.max(0, Math.round(json.usage?.output_tokens ?? 0)),
      costUsd: Number(json.usage?.cost ?? 0) || 0,
      durationMs,
      model: String(json.model || params.model || JEV_DEFAULT_MODEL),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), durationMs: Date.now() - startedAt };
  }
}

// ---------------------------------------------------------------------------------------------
// Orquestração (espelho de apps/web/src/lib/jev/decisions.ts): modo por recurso (OFF/SHADOW/ACTIVE,
// definido pelo admin master em JevFeatureSetting), custo exato no AIUsageLog e decisão no
// JevDecisionLog. Nunca lança.

// Recursos do Jev no worker — mantidos em sincronia manual com apps/web/src/lib/jev/features.ts
// (lá fica o `activeAvailable` que o admin enxerga).
export const WORKER_JEV_FEATURES = {
  REVIEW_CLASSIFICATION: "jev_review_classification",
  KNOWLEDGE_DRIFT_PRECHECK: "jev_knowledge_drift_precheck",
} as const;
export type WorkerJevFeature = (typeof WORKER_JEV_FEATURES)[keyof typeof WORKER_JEV_FEATURES];

const SETTING_TTL_MS = 60_000;
const settingCache = new Map<string, { mode: JevMode; model: string; at: number }>();

export async function getJevSetting(prisma: PrismaClient, feature: WorkerJevFeature): Promise<{ mode: JevMode; model: string }> {
  const cached = settingCache.get(feature);
  if (cached && Date.now() - cached.at < SETTING_TTL_MS) return cached;
  try {
    const row = await prisma.jevFeatureSetting.findUnique({ where: { feature }, select: { mode: true, model: true } });
    const value = { mode: row?.mode ?? ("OFF" as JevMode), model: row?.model || JEV_DEFAULT_MODEL, at: Date.now() };
    settingCache.set(feature, value);
    return value;
  } catch {
    return { mode: "OFF", model: JEV_DEFAULT_MODEL };
  }
}

export type WorkerJevOutcome = { mode: JevMode; logId: string | null; answers: Record<string, JevAnswer> | null };

export async function runWorkerJevDecision(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    feature: WorkerJevFeature;
    state: unknown;
    questions: Record<string, JevQuestion>;
    subjectRef?: string | null;
    decide?: (answers: Record<string, JevAnswer>) => string;
    timeoutMs?: number;
  }
): Promise<WorkerJevOutcome | null> {
  try {
    const { mode, model } = await getJevSetting(prisma, params.feature);
    if (mode === "OFF") return null;

    const result = await callJev({ state: params.state, questions: params.questions, model, timeoutMs: params.timeoutMs });
    if (result.ok) {
      await logWorkerAiUsage(prisma, {
        tenantId: params.tenantId,
        feature: params.feature,
        model,
        provider: "openrouter",
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      });
    } else {
      console.error(`[jev] ${params.feature} falhou — tenant=${params.tenantId}: ${result.error}`);
    }

    const log = await prisma.jevDecisionLog
      .create({
        data: {
          tenantId: params.tenantId,
          feature: params.feature,
          mode,
          subjectRef: params.subjectRef ?? null,
          answers: result.ok ? (result.answers as object) : undefined,
          decision: result.ok && params.decide ? params.decide(result.answers) : null,
          durationMs: result.durationMs,
          costUsd: result.ok ? Math.round(result.costUsd * 1e8) / 1e8 : 0,
          error: result.ok ? null : result.error.slice(0, 500),
        },
        select: { id: true },
      })
      .catch((err: any) => {
        console.error("[jev] falha ao registrar decisão:", err?.message || err);
        return null;
      });

    return { mode, logId: log?.id ?? null, answers: result.ok ? result.answers : null };
  } catch (err: any) {
    console.error("[jev] erro inesperado:", err?.message || err);
    return null;
  }
}

export async function recordJevObservedOutcome(prisma: PrismaClient, tenantId: string, logId: string | null | undefined, outcome: string) {
  if (!logId) return;
  await prisma.jevDecisionLog
    .updateMany({ where: { id: logId, tenantId }, data: { observedOutcome: outcome.slice(0, 100) } })
    .catch((err: any) => console.error("[jev] falha ao registrar desfecho:", err?.message || err));
}
