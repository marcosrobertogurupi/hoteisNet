// Cálculo de custo de uma chamada de IA a partir da tabela de preços versionada (AiModelPrice).
// O custo é gravado como snapshot em AIUsageLog.totalCostUsd, mas sempre recalculável: pega a
// linha de preço com maior effectiveFrom <= a data da chamada.
import { prisma } from "@/lib/prisma";

// Fallback se o modelo não estiver na tabela (não deveria acontecer — o seed cobre os usados).
// Mesmos números que eram constantes fixas antes desta fase (gemini-2.5-flash, tier pago).
const FALLBACK_USD_PER_M = { input: 0.3, cachedInput: 0.075, output: 2.5 };

export interface AiUsageTokens {
  model: string;
  tokensInput: number;
  tokensCachedInput: number;
  // tokensOutput já inclui os tokens de reasoning/thinking — não somar de novo.
  tokensOutput: number;
}

export async function computeAiCostUsd(usage: AiUsageTokens, at: Date = new Date()): Promise<number> {
  const price = await prisma.aiModelPrice.findFirst({
    where: { model: usage.model, effectiveFrom: { lte: at } },
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

  const uncachedInput = Math.max(0, usage.tokensInput - usage.tokensCachedInput);
  const cost =
    (uncachedInput * perM.input + usage.tokensCachedInput * perM.cachedInput + usage.tokensOutput * perM.output) /
    1_000_000;

  // Arredonda à 8ª casa (precisão da coluna) para não gravar dízima binária.
  return Math.round(cost * 1e8) / 1e8;
}
