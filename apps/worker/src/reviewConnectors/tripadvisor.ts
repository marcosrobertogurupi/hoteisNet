// Coleta de reviews do TripAdvisor via Apify — mesmo padrão de camada única (Apify) do Google Maps
// (googleMaps.ts): o TripAdvisor não tem API oficial viável (Content API v2 é limitada a 5 reviews)
// e a decisão do módulo foi usar serviço de scraping pago em vez de manter scraper próprio (ver
// plano de implementação). Ator `web_wanderer~tripadvisor-reviews-scraper` via
// run-sync-get-dataset-items, mesma estratégia de chamada síncrona única usada em googleMaps.ts.
//
// Diferente do Google Maps (Place ID), o identificador aqui é a URL completa da página do
// hotel no TripAdvisor (ex.: https://www.tripadvisor.com.br/Hotel_Review-g.../Reviews-...html) —
// não existe um "id curto" estável e público como o Place ID do Google.
//
// APIFY_TOKEN precisa ser configurado (Railway) para este conector funcionar; sem ele, retorna erro
// tratado (não lança exceção) para reviewsSync.ts registrar no conector como qualquer outra falha.
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";
import { apifyHttpErrorResult } from "./apifyErrors";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const ACTOR_ID = "web_wanderer~tripadvisor-reviews-scraper";
// Teto de reviews por sincronização — guard-rail de custo, mesmo raciocínio de googleMaps.ts.
// Bem menor em sincronizações incrementais (conector já rodou antes): o normal de um ciclo de 12h é
// 0-5 reviews novos, não 100 — pedir 100 a cada ciclo pagava e descartava dezenas de reviews antigos
// a cada sincronização (achado real em produção em 16/09/2026, ver PRD.md Fase 29).
const MAX_REVIEWS_BACKFILL = 100;
const MAX_REVIEWS_INCREMENTAL = 20;
const APIFY_TIMEOUT_MS = 150_000;

// Formato do item devolvido pelo ator (campos em snake_case) — confirmado contra uma execução real
// em 15/09/2026 com o hotel de teste (Vivence Hotel Palmas). `author` costuma vir vazio; nesse caso
// cai para `author_username`.
interface ApifyTripAdvisorReviewItem {
  review_id?: string | number;
  rating?: number;
  title?: string | null;
  text?: string | null;
  published_date?: string; // "AAAA-MM-DD"
  author?: string | null;
  author_username?: string | null;
  review_url?: string;
}

export async function fetchTripAdvisorReviews(params: {
  listingUrl: string | null;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  if (!APIFY_TOKEN) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "APIFY_TOKEN não configurado no worker." };
  }
  if (!params.listingUrl) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "URL da página do hotel no TripAdvisor não configurada." };
  }

  // Nomes de parâmetro confirmados na documentação do Apify Store (não são os mesmos do ator de
  // Google Maps — cada ator da comunidade define seu próprio schema):
  //  - maxReviewsPerLocation: teto de reviews por URL (default do ator é 50; 0 = ilimitado).
  //  - showOriginalReviews: sem isso, o ator devolve o texto traduzido automaticamente para inglês
  //    em vez do idioma original do review — crítico para um hotel brasileiro.
  //  - sortBy: "most_recent" (não "newest" — outro nome de valor específico deste ator).
  //  - include_personal_information: sem isso, author/author_username vêm vazios.
  //
  // Corte de data: a documentação pública deste ator não confirma um parâmetro de corte por data, e
  // sem ele o ator devolvia até 100 reviews a cada sincronização, mesmo com só 0-5 reviews novos
  // desde o último ciclo — cobrados pela Apify e descartados depois por filterRecentReviews em
  // reviewsSync.ts (achado real em produção em 16/09/2026). Manda vários nomes candidatos ao mesmo
  // tempo (custo zero se o ator ignorar os que não reconhece) — mesma estratégia defensiva do
  // projeto de referência que originou este módulo (radar-views/Reputei) diante de um schema de ator
  // da comunidade não totalmente documentado. Some com o teto bem menor em sincronizações
  // incrementais (MAX_REVIEWS_INCREMENTAL) como segunda linha de defesa contra o mesmo problema.
  const reviewsStartDate = params.sinceDate
    ? new Date(params.sinceDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const maxReviews = params.sinceDate ? MAX_REVIEWS_INCREMENTAL : MAX_REVIEWS_BACKFILL;

  const input = {
    startUrls: [{ url: params.listingUrl }],
    maxReviewsPerLocation: maxReviews,
    sortBy: "most_recent",
    showOriginalReviews: true,
    include_personal_information: true,
    startDate: reviewsStartDate,
    reviewsStartDate,
    publishedAfter: reviewsStartDate,
    dateFrom: reviewsStartDate,
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

  let items: ApifyTripAdvisorReviewItem[];
  try {
    items = (await response.json()) as ApifyTripAdvisorReviewItem[];
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}` };
  }

  const reviews: NormalizedReviewInput[] = [];
  for (const item of items) {
    const externalId = item.review_id != null ? String(item.review_id) : null;
    if (!externalId) continue; // sem id não dá para deduplicar — descarta em vez de arriscar duplicar

    const publishedAt = item.published_date ? new Date(item.published_date) : new Date();
    reviews.push({
      externalId,
      rating: typeof item.rating === "number" ? item.rating : null,
      title: item.title || null,
      body: item.text || null,
      authorName: item.author || item.author_username || null,
      url: item.review_url || null,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      rawData: item,
    });
  }

  return { reviewsFetched: items.length, reviews };
}
