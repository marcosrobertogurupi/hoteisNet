// Configuração de "thinking" do Gemini para chamadas que não precisam dele (resumos, classificação,
// redação curta). Medição de 30 dias (25/09/2026) mostrou que a maior parte da saída faturada dessas
// chamadas era thinking do gemini-2.5-flash. Por família:
//  - 2.5-flash / 2.5-flash-lite: thinkingBudget 0 desliga;
//  - 2.5-pro: não pode desligar — usa o mínimo aceito (128);
//  - demais (2.0/1.5 sem thinking; 3.x usa thinkingLevel, ainda não validado aqui): não envia nada,
//    para nunca quebrar a chamada com um campo que o modelo rejeita.
// Espelho de geminiThinkingConfig em apps/worker/src/aiUsage.ts — mude os dois juntos.
//
// NÃO usar no agente de atendimento (ToolLoopAgent): ele decide tool calls de reserva/cancelamento,
// função vital — lá o thinking fica como está.
export function geminiThinkingConfig(model: string): { thinkingBudget: number } | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  return undefined;
}

// Formato providerOptions do AI SDK (@ai-sdk/google) — undefined quando o modelo não recebe config.
export function googleThinkingProviderOptions(model: string): { google: { thinkingConfig: { thinkingBudget: number } } } | undefined {
  const thinkingConfig = geminiThinkingConfig(model);
  return thinkingConfig ? { google: { thinkingConfig } } : undefined;
}
