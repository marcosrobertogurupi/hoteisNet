// Chaves técnicas dos recursos de IA — gravadas em `AIUsageLog.feature`, usadas para resolver o
// modelo por recurso (modelResolver.ts) e traduzidas para linguagem de negócio em aiFeatureLabels.ts.
// Ao criar um novo recurso de IA, adicione a chave aqui, o rótulo em aiFeatureLabels.ts e (se ele
// usar tools) inclua em AI_FEATURES_NEED_FUNCTION_CALLING.
//
// O worker (apps/worker) não importa este arquivo — mantém as próprias constantes dos recursos
// operacionais (operationalAgent.ts). Se mudar uma chave aqui, mude lá também.
export const AI_FEATURES = {
  WHATSAPP_GUEST_SUPPORT: "whatsapp_guest_support",
  WHATSAPP_GUEST_SUPPORT_SUMMARY: "whatsapp_guest_support_summary",
  PLATFORM_SUPPORT: "platform_support",
  OPERATIONAL_MONITORING: "operational_monitoring",
  OPERATIONAL_KNOWLEDGE_DRIFT: "operational_knowledge_drift",
} as const;

export type AiFeature = (typeof AI_FEATURES)[keyof typeof AI_FEATURES];

export const AI_FEATURE_LIST: AiFeature[] = Object.values(AI_FEATURES);

// Recursos que fazem tool-calling: a lista de modelos oferecida ao admin para eles é restrita a
// modelos que suportam function calling (o agente de atendimento usa ToolLoopAgent e quebra sem).
export const AI_FEATURES_NEED_FUNCTION_CALLING: AiFeature[] = [AI_FEATURES.WHATSAPP_GUEST_SUPPORT];

export function isKnownAiFeature(value: string): value is AiFeature {
  return (AI_FEATURE_LIST as string[]).includes(value);
}

export function featureNeedsFunctionCalling(feature: AiFeature): boolean {
  return AI_FEATURES_NEED_FUNCTION_CALLING.includes(feature);
}
