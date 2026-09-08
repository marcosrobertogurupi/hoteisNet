// Faturamento do consumo de IA (revendido ao assinante como serviço extra). Converte o custo real
// em USD (o que o Google cobra) para BRL e aplica a margem (markupPct) — o resultado é o preço
// faturável ao hotel. Só o admin master vê isto.
import { prisma } from "@/lib/prisma";

export interface AiBillingConfig {
  usdToBrlRate: number;
  markupPct: number;
  rateUpdatedAt: Date | null;
  updatedByName: string | null;
  updatedAt: Date | null;
}

const DEFAULTS = { usdToBrlRate: 5, markupPct: 100 };

export async function getAiBillingConfig(): Promise<AiBillingConfig> {
  try {
    const row = await prisma.aiBillingConfig.findUnique({ where: { id: "singleton" } });
    return {
      usdToBrlRate: row ? Number(row.usdToBrlRate) : DEFAULTS.usdToBrlRate,
      markupPct: row?.markupPct ?? DEFAULTS.markupPct,
      rateUpdatedAt: row?.rateUpdatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  } catch {
    // Tabela ainda não migrada — usa os defaults para não derrubar a telemetria.
    return { ...DEFAULTS, rateUpdatedAt: null, updatedByName: null, updatedAt: null };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// custoBrl = custoUsd × câmbio · precoBrl = custoBrl × (1 + margem%) · margemBrl = preco − custo
export function billFromCostUsd(
  costUsd: number,
  cfg: { usdToBrlRate: number; markupPct: number }
): { costBrl: number; priceBrl: number; marginBrl: number } {
  const costBrl = costUsd * cfg.usdToBrlRate;
  const priceBrl = costBrl * (1 + cfg.markupPct / 100);
  return { costBrl: round2(costBrl), priceBrl: round2(priceBrl), marginBrl: round2(priceBrl - costBrl) };
}
