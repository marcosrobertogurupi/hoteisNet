// Tratamento comum da resposta HTTP de erro da Apify para os conectores de scraping pago
// (googleMaps.ts, tripadvisor.ts, booking.ts, facebook.ts, reclameAqui.ts) — antes cada um repetia
// o mesmo bloco, e nenhum distinguia "a conta da plataforma está bloqueada" de um erro do conector.
import type { ReviewConnectorResult } from "./types";

// Tipo de erro que a Apify devolve (HTTP 403) quando a CONTA inteira fica impedida de rodar atores —
// no incidente real de 22-24/09/2026, `"Monthly usage hard limit exceeded"` (cota mensal estourada).
// Não é defeito do conector nem do hotel: nenhuma tentativa funciona até a cota voltar, então
// reviewsSync.ts pausa todas as coletas via Apify (ver apifyQuotaPause.ts) em vez de tratar como erro
// comum do conector.
const APIFY_ACCOUNT_BLOCKED_ERROR_TYPE ="platform-feature-disabled";

// Mesma situação (saldo do ciclo acabou), mas recusada ANTES do 403 acima: quando o que sobra do
// ciclo não cobre mais uma execução, a Apify responde 402/400 com um destes tipos. Incidente real de
// 04-08/10/2026: só o 403 pausava, e estes três entravam como erro comum do conector — retestados a
// cada 30-60min por até 72h (432 coletas falhas no mês), sem pausa nem aviso à plataforma.
export const APIFY_OUT_OF_BUDGET_ERROR_TYPES = [
  APIFY_ACCOUNT_BLOCKED_ERROR_TYPE,
  "not-enough-usage-to-run-paid-actor",
  "max-total-charge-usd-must-be-greater-than-zero",
  "max-items-must-be-greater-than-zero",
];

// A execução do ator chegou a rodar (e foi cobrada) mas não devolveu os itens: estourou o tempo ou
// falhou dentro da Apify.
const APIFY_RUN_FAILED_ERROR_TYPES = ["run-failed", "actor-run-failed", "run-timeout-exceeded"];

function apifyErrorType(body: string): string | null {
  try {
    const type = JSON.parse(body)?.error?.type;
    return typeof type === "string" ? type : null;
  } catch {
    return [...APIFY_OUT_OF_BUDGET_ERROR_TYPES, ...APIFY_RUN_FAILED_ERROR_TYPES].find((t) => body.includes(t)) ?? null;
  }
}

export function apifyHttpErrorResult(status: number, body: string): ReviewConnectorResult {
  const type = apifyErrorType(body);
  return {
    reviewsFetched: 0,
    reviews: [],
    errorMessage: `Apify respondeu ${status}: ${body.slice(0, 300)}`,
    apifyQuotaExceeded: type != null && APIFY_OUT_OF_BUDGET_ERROR_TYPES.includes(type),
    // 408 = o run-sync parou de esperar (300s), mas o ator segue rodando e cobrando na Apify.
    apifyRunCharged: status === 408 || (type != null && APIFY_RUN_FAILED_ERROR_TYPES.includes(type)),
  };
}
