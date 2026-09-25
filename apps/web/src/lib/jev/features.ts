// Recursos que usam o Jev. Ficam FORA de AI_FEATURES (lib/aiAgent/features.ts) de propósito: aquela
// lista alimenta o seletor de modelo Gemini do admin, e o Jev não é intercambiável com um modelo de
// texto. A chave é gravada em AIUsageLog.feature (custo) e JevDecisionLog.feature (decisões) — o
// rótulo amigável fica em lib/aiFeatureLabels.ts.
//
// `activeAvailable`: se o modo ACTIVE já tem efeito no código. Enquanto for false, o admin só pode
// escolher OFF/SHADOW para aquele recurso (cada recurso ganha o ACTIVE na sua fase).
// Os recursos do worker (review/base) são usados em apps/worker/src/jev.ts (WORKER_JEV_FEATURES) —
// ficam aqui também para o admin master ver/configurar. Mantenha as chaves em sincronia.
export const JEV_FEATURES = {
  WHATSAPP_TRIAGE: "jev_whatsapp_triage",
  REVIEW_CLASSIFICATION: "jev_review_classification",
  KNOWLEDGE_DRIFT_PRECHECK: "jev_knowledge_drift_precheck",
} as const;

export type JevFeature = (typeof JEV_FEATURES)[keyof typeof JEV_FEATURES];

export const JEV_FEATURE_DEFS: Record<JevFeature, { activeAvailable: boolean }> = {
  [JEV_FEATURES.WHATSAPP_TRIAGE]: { activeAvailable: false },
  [JEV_FEATURES.REVIEW_CLASSIFICATION]: { activeAvailable: true },
  [JEV_FEATURES.KNOWLEDGE_DRIFT_PRECHECK]: { activeAvailable: true },
};

export const JEV_FEATURE_LIST = Object.keys(JEV_FEATURE_DEFS) as JevFeature[];

export function isKnownJevFeature(value: string): value is JevFeature {
  return (JEV_FEATURE_LIST as string[]).includes(value);
}
