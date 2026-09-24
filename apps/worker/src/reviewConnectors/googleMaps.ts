// Coleta de reviews do Google Maps — camada 2 da estratégia em cascata do módulo de reviews
// (API oficial OAuth do Google Business Profile fica para uma fase futura: exige o hotel autorizar
// um app no Google Cloud Console, algo que não dá para provisionar sozinho; ver plano de
// implementação do módulo). Usa o ator Apify `compass~google-maps-reviews-scraper` via
// run-sync-get-dataset-items (roda o ator e devolve os itens numa única chamada HTTP síncrona, sem
// precisar fazer polling de status) — mesmo ator usado pelo projeto de referência que originou este
// módulo.
//
// APIFY_TOKEN precisa ser configurado (Railway) para este conector funcionar; sem ele, retorna erro
// tratado (não lança exceção) para reviewsSync.ts registrar no conector como qualquer outra falha.
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";
import { apifyHttpErrorResult } from "./apifyErrors";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const ACTOR_ID = "compass~google-maps-reviews-scraper";
// Teto de reviews por sincronização — guard-rail de custo (cada item cobrado pelo Apify), suficiente
// para um ciclo incremental normal (a cada MIN_SYNC_INTERVAL_MINUTES, ver reviewsSync.ts).
const MAX_REVIEWS_PER_SYNC = 100;
// run-sync-get-dataset-items tem teto de execução do próprio Apify (~5min) — o timeout aqui é
// defesa extra para o worker nunca ficar preso indefinidamente num ciclo de cron.
const APIFY_TIMEOUT_MS = 150_000;

// Formato do item devolvido pelo ator compass/google-maps-reviews-scraper — best-effort a partir da
// documentação pública do ator; validar/ajustar contra uma execução real assim que houver um
// APIFY_TOKEN + Place ID de teste (o schema de saída de atores da comunidade Apify pode mudar sem
// aviso, diferente de uma API oficial versionada).
interface ApifyGoogleMapsReviewItem {
  reviewId?: string;
  id?: string;
  name?: string;
  text?: string | null;
  textTranslated?: string | null;
  stars?: number;
  publishedAtDate?: string; // ISO
  reviewUrl?: string;
}

export async function fetchGoogleMapsReviews(params: {
  placeId: string | null;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  if (!APIFY_TOKEN) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "APIFY_TOKEN não configurado no worker." };
  }
  if (!params.placeId) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "Place ID do Google Maps não configurado." };
  }

  // Corte de data: sincronizações incrementais usam lastSyncAt com 1 dia de margem de segurança (o
  // ator só aceita corte por dia, não por hora — a margem evita perder reviews publicados mais cedo
  // no mesmo dia do último sync). Sem lastSyncAt (primeira sincronização do conector), usa o mesmo
  // corte de 30 dias do resto do módulo em vez de deixar o ator devolver o histórico inteiro (que
  // seria cobrado pela Apify e só descartado depois por filterRecentReviews em reviewsSync.ts) —
  // mesma estratégia do projeto de referência que originou este módulo (radar-views/Reputei).
  const reviewsStartDate = params.sinceDate
    ? new Date(params.sinceDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const input = {
    placeIds: [params.placeId],
    maxReviews: MAX_REVIEWS_PER_SYNC,
    reviewsSort: "newest",
    language: "pt-BR",
    reviewsStartDate,
  };

  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
    });
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Falha de rede ao chamar Apify: ${err?.message || err}` };
  }

  if (!response.ok) {
    return apifyHttpErrorResult(response.status, await response.text().catch(() => ""));
  }

  let items: ApifyGoogleMapsReviewItem[];
  try {
    items = (await response.json()) as ApifyGoogleMapsReviewItem[];
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}` };
  }

  const reviews: NormalizedReviewInput[] = [];
  for (const item of items) {
    const externalId = item.reviewId || item.id;
    if (!externalId) continue; // sem id não dá para deduplicar — descarta em vez de arriscar duplicar

    const publishedAt = item.publishedAtDate ? new Date(item.publishedAtDate) : new Date();
    reviews.push({
      externalId,
      rating: typeof item.stars === "number" ? item.stars : null,
      title: null,
      body: item.textTranslated || item.text || null,
      authorName: item.name || null,
      url: item.reviewUrl || null,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      rawData: item,
    });
  }

  return { reviewsFetched: items.length, reviews };
}
