// Coleta de avaliações do Facebook via Apify — mesmo padrão de camada única dos demais conectores.
// Ator `apify~facebook-reviews-scraper` (oficial da própria Apify, não exige login/token de página)
// via run-sync-get-dataset-items.
//
// Particularidade do Facebook em relação aos outros canais: a página de "Avaliações" do Facebook
// não usa nota de 1 a 5 estrelas — é um sistema binário de recomendação (`isRecommended`: sim/não).
// Convertido aqui para a escala 0-5 usada internamente só para a UI mostrar algo consistente com os
// demais canais (recomendado -> 5, não recomendado -> 1); o valor bruto continua em `rawData` para
// a análise de sentimento da Fase 2 usar o booleano real em vez de inferir a partir da nota.
//
// O identificador aqui é a URL da página do Facebook do hotel — normalizada para terminar em
// "/reviews" (a URL que o ator espera), aceitando tanto a URL da página quanto já a de avaliações.
//
// APIFY_TOKEN precisa ser configurado (Railway) para este conector funcionar; sem ele, retorna erro
// tratado (não lança exceção) para reviewsSync.ts registrar no conector como qualquer outra falha.
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";
import { apifyHttpErrorResult } from "./apifyErrors";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const ACTOR_ID = "apify~facebook-reviews-scraper";
// Teto de reviews por sincronização — guard-rail de custo, mesmo raciocínio dos demais conectores.
const MAX_REVIEWS_PER_SYNC = 100;
const APIFY_TIMEOUT_MS = 150_000;

// Formato do item devolvido pelo ator — confirmado na documentação do Apify Store.
interface ApifyFacebookReviewItem {
  id?: string;
  text?: string | null;
  date?: string; // ISO
  isRecommended?: boolean | null;
  user?: { name?: string };
  url?: string;
}

function normalizePageReviewsUrl(pageUrl: string): string {
  const trimmed = pageUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/reviews") ? trimmed : `${trimmed}/reviews`;
}

// isRecommended -> escala 0-5 só para exibição consistente com os demais canais (ver comentário no
// topo do arquivo) — não é uma nota real do Facebook.
function ratingFromRecommendation(isRecommended: boolean | null | undefined): number | null {
  if (isRecommended === true) return 5;
  if (isRecommended === false) return 1;
  return null;
}

export async function fetchFacebookReviews(params: {
  pageUrl: string | null;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  if (!APIFY_TOKEN) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "APIFY_TOKEN não configurado no worker." };
  }
  if (!params.pageUrl) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "URL da página do Facebook não configurada." };
  }

  const input = {
    startUrls: [{ url: normalizePageReviewsUrl(params.pageUrl) }],
    resultsLimit: MAX_REVIEWS_PER_SYNC,
    // Corte de data nativo do ator (confirmado na documentação) — diferente de TripAdvisor/Booking,
    // aqui dá para pedir só o que é novo em vez de sempre trazer o teto inteiro.
    ...(params.sinceDate ? { onlyReviewsNewerThan: params.sinceDate.toISOString().slice(0, 10) } : {}),
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

  let items: ApifyFacebookReviewItem[];
  try {
    items = (await response.json()) as ApifyFacebookReviewItem[];
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}` };
  }

  const reviews: NormalizedReviewInput[] = [];
  for (const item of items) {
    const externalId = item.id || null;
    if (!externalId) continue; // sem id não dá para deduplicar — descarta em vez de arriscar duplicar

    const publishedAt = item.date ? new Date(item.date) : new Date();
    reviews.push({
      externalId,
      rating: ratingFromRecommendation(item.isRecommended),
      title: null,
      body: item.text || null,
      authorName: item.user?.name || null,
      url: item.url || null,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      rawData: item,
    });
  }

  return { reviewsFetched: items.length, reviews };
}
