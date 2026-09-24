// Tratamento comum da resposta HTTP de erro da Apify para os conectores de scraping pago
// (googleMaps.ts, tripadvisor.ts, booking.ts, facebook.ts, reclameAqui.ts) — antes cada um repetia
// o mesmo bloco, e nenhum distinguia "a conta da plataforma está bloqueada" de um erro do conector.
import type { ReviewConnectorResult } from "./types";

// Tipo de erro que a Apify devolve (HTTP 403) quando a CONTA inteira fica impedida de rodar atores —
// no incidente real de 22-24/09/2026, `"Monthly usage hard limit exceeded"` (cota mensal estourada).
// Não é defeito do conector nem do hotel: nenhuma tentativa funciona até a cota voltar, então
// reviewsSync.ts pausa todas as coletas via Apify (ver apifyQuotaPause.ts) em vez de tratar como erro
// comum do conector.
export const APIFY_ACCOUNT_BLOCKED_ERROR_TYPE = "platform-feature-disabled";

function isApifyAccountBlocked(status: number, body: string): boolean {
  if (status !== 403) return false;
  try {
    return JSON.parse(body)?.error?.type === APIFY_ACCOUNT_BLOCKED_ERROR_TYPE;
  } catch {
    return body.includes(APIFY_ACCOUNT_BLOCKED_ERROR_TYPE);
  }
}

export function apifyHttpErrorResult(status: number, body: string): ReviewConnectorResult {
  return {
    reviewsFetched: 0,
    reviews: [],
    errorMessage: `Apify respondeu ${status}: ${body.slice(0, 300)}`,
    apifyQuotaExceeded: isApifyAccountBlocked(status, body),
  };
}
