// Normaliza o objeto `usage` do AI SDK (generateText / generateObject / ToolLoopAgent) para os
// campos que logAiUsage espera. Isola a dependência do formato do SDK num lugar só.
//
// No AI SDK v7: `inputTokens` é o total de entrada (inclui cache); `inputTokenDetails.cacheReadTokens`
// é a parte lida de cache; `outputTokens` é o total de saída JÁ incluindo reasoning;
// `outputTokenDetails.reasoningTokens` é a parte de thinking.
type SdkUsage = {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
} | undefined | null;

export interface NormalizedUsage {
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  tokensReasoning: number;
}

export function readUsage(usage: SdkUsage): NormalizedUsage {
  return {
    tokensInput: Math.max(0, Math.round(usage?.inputTokens ?? 0)),
    tokensOutput: Math.max(0, Math.round(usage?.outputTokens ?? 0)),
    tokensCachedInput: Math.max(0, Math.round(usage?.inputTokenDetails?.cacheReadTokens ?? 0)),
    tokensReasoning: Math.max(0, Math.round(usage?.outputTokenDetails?.reasoningTokens ?? 0)),
  };
}
