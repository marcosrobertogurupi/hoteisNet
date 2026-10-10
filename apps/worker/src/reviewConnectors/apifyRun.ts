// Chamada síncrona comum aos conectores de scraping pago (run-sync-get-dataset-items: roda o ator e
// devolve os itens numa única chamada HTTP) — antes cada conector repetia este bloco.
//
// Incidente real de 04-08/10/2026 (cota mensal da Apify inteira gasta em 4 dias por um hotel de
// teste): quando o worker desistia da conexão por timeout, a execução NÃO parava na Apify — seguia
// rodando até o fim e era cobrada inteira, com o resultado descartado. Como o timeout virava erro
// comum do conector, o retry de 30min disparava outra execução paga a cada hora (12 das 19 execuções
// do Reclame Aqui no ciclo, ~US$ 3 de US$ 5). Por isso:
//  - o `timeout` vai também para a Apify, um pouco abaixo do timeout do worker: ela encerra o ator
//    e responde antes de o worker largar a conexão, então nada segue rodando (e cobrando) às cegas;
//  - toda falha depois que o ator já rodou volta marcada com `apifyRunCharged`, para reviewsSync.ts
//    só tentar de novo na cadência normal do canal, nunca no retry curto.
import type { ReviewConnectorResult } from "./types";
import { apifyHttpErrorResult } from "./apifyErrors";

const APIFY_TIMEOUT_MARGIN_SECONDS = 15;

export async function runApifyActorSync<T>(
  actorId: string,
  input: unknown,
  timeoutMs: number
): Promise<{ items: T[] } | { error: ReviewConnectorResult }> {
  const token = process.env.APIFY_TOKEN || "";
  const runTimeoutSeconds = Math.max(30, Math.floor(timeoutMs / 1000) - APIFY_TIMEOUT_MARGIN_SECONDS);
  const url =
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${runTimeoutSeconds}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    return {
      error: {
        reviewsFetched: 0,
        reviews: [],
        errorMessage: `Falha de rede ao chamar Apify: ${err?.message || err}`,
        // Timeout do worker = o ator já estava rodando; outra falha de rede (DNS, conexão recusada)
        // acontece antes de a Apify receber a chamada.
        apifyRunCharged: err?.name === "TimeoutError",
      },
    };
  }

  if (!response.ok) {
    return { error: apifyHttpErrorResult(response.status, await response.text().catch(() => "")) };
  }

  try {
    return { items: (await response.json()) as T[] };
  } catch (err: any) {
    return {
      error: {
        reviewsFetched: 0,
        reviews: [],
        errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}`,
        apifyRunCharged: true,
      },
    };
  }
}
