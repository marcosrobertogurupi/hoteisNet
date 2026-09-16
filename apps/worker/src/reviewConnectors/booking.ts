// Coleta de reviews do Booking.com via Apify — mesmo padrão de camada única dos demais conectores
// (googleMaps.ts, tripadvisor.ts): sem API oficial de parceiro viável para um hotel individual, o
// módulo usa scraping pago em vez de scraper próprio (ver plano de implementação). Ator
// `voyager~booking-reviews-scraper` via run-sync-get-dataset-items.
//
// O identificador aqui é a URL da página do hotel no Booking.com (mesmo padrão do TripAdvisor —
// não existe um id curto estável como o Place ID do Google).
//
// Particularidades do Booking.com em relação aos outros canais (confirmadas na documentação do
// Apify Store, ver comentários abaixo):
//  - Nota nativa é 1-10 (string, ex: "10", "7.0"), não 1-5 — convertida aqui para a escala 0-5 usada
//    internamente em `Review.rating`, igual aos demais canais.
//  - Não existe um único campo de texto: o hóspede escreve separadamente o que gostou
//    (`reviewTextParts.Liked`) e o que não gostou (`reviewTextParts.Disliked`) — unidos aqui num
//    único `body` com marcadores 👍/👎, mesmo padrão adotado no projeto de referência que originou
//    este módulo (facilita a leitura humana e a análise de sentimento da Fase 2, que lê `body`).
//
// APIFY_TOKEN precisa ser configurado (Railway) para este conector funcionar; sem ele, retorna erro
// tratado (não lança exceção) para reviewsSync.ts registrar no conector como qualquer outra falha.
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const ACTOR_ID = "voyager~booking-reviews-scraper";
// Teto de reviews por sincronização — guard-rail de custo, mesmo raciocínio dos demais conectores.
// Bem menor em sincronizações incrementais (conector já rodou antes): o normal de um ciclo de 12h é
// 0-5 reviews novos, não 100 — pedir 100 a cada ciclo pagava e descartava dezenas de reviews antigos
// a cada sincronização (achado real em produção em 16/09/2026, ver PRD.md Fase 29).
const MAX_REVIEWS_BACKFILL = 100;
const MAX_REVIEWS_INCREMENTAL = 20;
const APIFY_TIMEOUT_MS = 150_000;

// Formato do item devolvido pelo ator — confirmado contra uma execução real em 15/09/2026 (Vivence
// Hotel Palmas). Diverge da documentação pública do ator no Apify Store, que descreve um campo
// aninhado `reviewTextParts.Liked/Disliked` — a saída real usa `likedText`/`dislikedText` soltos
// (mesma lição já registrada em tripadvisor.ts: schema de ator da comunidade Apify muda sem aviso,
// a fonte confiável é uma execução real, não só a doc). O ator também devolve dezenas de outros
// campos (hotelRatingScores, checkInDate, travelerType...) que não mapeamos por ora.
interface ApifyBookingReviewItem {
  id?: string;
  rating?: number | string; // escala 1-10
  reviewTitle?: string | null;
  reviewDate?: string; // ISO completo
  userName?: string;
  likedText?: string | null;
  dislikedText?: string | null;
}

// 1-10 (Booking) -> 0-5 (interno), 1 casa decimal, sempre dentro de [0, 5].
function normalizeRating(raw: number | string | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (isNaN(n)) return null;
  return Math.min(5, Math.max(0, Math.round((n / 2) * 10) / 10));
}

function buildBody(item: ApifyBookingReviewItem): string | null {
  const liked = item.likedText?.trim();
  const disliked = item.dislikedText?.trim();
  const blocks: string[] = [];
  if (liked) blocks.push(`👍 Positivo: ${liked}`);
  if (disliked) blocks.push(`👎 Negativo: ${disliked}`);
  return blocks.length > 0 ? blocks.join("\n") : null;
}

export async function fetchBookingReviews(params: {
  hotelUrl: string | null;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  if (!APIFY_TOKEN) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "APIFY_TOKEN não configurado no worker." };
  }
  if (!params.hotelUrl) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "URL do hotel no Booking.com não configurada." };
  }

  // Corte de data: a documentação pública deste ator não confirma um parâmetro de corte por data, e
  // sem ele o ator devolvia até 100 reviews a cada sincronização, mesmo com só 0-5 reviews novos
  // desde o último ciclo — cobrados pela Apify e descartados depois por filterRecentReviews em
  // reviewsSync.ts (achado real em produção em 16/09/2026). Manda vários nomes candidatos ao mesmo
  // tempo (custo zero se o ator ignorar os que não reconhece) — mesma estratégia defensiva do
  // projeto de referência que originou este módulo (radar-views/Reputei). Some com o teto bem menor
  // em sincronizações incrementais (MAX_REVIEWS_INCREMENTAL) como segunda linha de defesa.
  const reviewsStartDate = params.sinceDate
    ? new Date(params.sinceDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const maxReviews = params.sinceDate ? MAX_REVIEWS_INCREMENTAL : MAX_REVIEWS_BACKFILL;

  const input = {
    startUrls: [{ url: params.hotelUrl }],
    maxReviewsPerHotel: maxReviews,
    sortBy: "newest",
    sort: "newest",
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
    const text = await response.text().catch(() => "");
    return {
      reviewsFetched: 0,
      reviews: [],
      errorMessage: `Apify respondeu ${response.status}: ${text.slice(0, 300)}`,
    };
  }

  let items: ApifyBookingReviewItem[];
  try {
    items = (await response.json()) as ApifyBookingReviewItem[];
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}` };
  }

  const reviews: NormalizedReviewInput[] = [];
  for (const item of items) {
    const externalId = item.id || null;
    if (!externalId) continue; // sem id não dá para deduplicar — descarta em vez de arriscar duplicar

    const publishedAt = item.reviewDate ? new Date(item.reviewDate) : new Date();
    reviews.push({
      externalId,
      rating: normalizeRating(item.rating),
      title: item.reviewTitle || null,
      body: buildBody(item),
      authorName: item.userName || null,
      url: null, // o ator não devolve link direto por review individual
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      rawData: item,
    });
  }

  return { reviewsFetched: items.length, reviews };
}
