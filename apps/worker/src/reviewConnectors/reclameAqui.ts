// Coleta de reclamações do Reclame Aqui via Apify — mesmo padrão de camada única (Apify) dos
// demais conectores sem API oficial (tripadvisor.ts, booking.ts): o Reclame Aqui não tem API
// pública, e o site é protegido por Cloudflare, tornando um scraper próprio caro de manter — a
// decisão do módulo foi usar sempre serviço de scraping pago em vez de scraper próprio (ver plano
// de implementação). Ator `gabruck97~reclameaqui` via run-sync-get-dataset-items.
//
// Diferente dos demais canais, o identificador aqui é o SLUG da empresa na URL do Reclame Aqui
// (ex.: "vivence-hotel-palmas"), não uma URL completa nem um id — é o valor esperado pelo parâmetro
// `nome_loja` do ator.
//
// Reclame Aqui é o canal mais caro dos já implementados neste módulo (~US$0,05/item no Apify,
// contra centavos de dólar por milhar nos demais) — o teto de itens por sincronização aqui é bem
// menor de propósito.
//
// APIFY_TOKEN precisa ser configurado (Railway) para este conector funcionar; sem ele, retorna erro
// tratado (não lança exceção) para reviewsSync.ts registrar no conector como qualquer outra falha.
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";
import { apifyHttpErrorResult } from "./apifyErrors";

const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const ACTOR_ID = "gabruck97~reclameaqui";
// Bem mais baixo que os demais conectores (100) por causa do custo por item ~17-80x maior e do
// tempo de execução bem mais alto (scraping via browser real, ver APIFY_TIMEOUT_MS abaixo).
const MAX_COMPLAINTS_PER_SYNC = 10;
// Bem mais alto que os demais conectores (150s) — o Reclame Aqui é protegido por Cloudflare, e o
// ator precisa de scraping via browser real para passar pelo desafio, tornando cada execução
// sensivelmente mais lenta que os demais canais (confirmado em execuções reais, que estouraram
// 150s e depois 280s contra uma empresa grande/de alto tráfego — empresas menores tendem a ser
// mais rápidas). 300s é também perto do teto prático do endpoint síncrono da Apify.
const APIFY_TIMEOUT_MS = 300_000;

// Formato do item devolvido pelo ator — confirmado contra uma execução real em 15/09/2026 (nomes de
// campo batem com a documentação pública do ator, diferente do que aconteceu com TripAdvisor e
// Booking). `id_reclamacao` vem como string com prefixo ("ID: 258834613"), não um id numérico puro
// — sem problema para deduplicação, só cosmético. `data` vem em formato brasileiro por extenso
// ("15/09/2026 às 11:53"), que `new Date(...)` não interpreta — ver parseReclameAquiDate abaixo.
interface ApifyReclameAquiItem {
  id_reclamacao?: string | number;
  data?: string;
  texto_principal?: string | null;
  status_resultado?: string;
  nota_atendimento?: number | null;
  link?: string;
  cidade?: string;
}

// "15/09/2026 às 11:53" -> Date. new Date(string) não entende esse formato (retorna Invalid Date
// silenciosamente) — sem esse parser, todo review caía no fallback "agora" e vários reviews de
// horários diferentes do mesmo dia ficavam com o mesmo publishedAt (bug real encontrado testando
// contra dado real). Devolve null se o formato não bater, para o chamador decidir o fallback.
function parseReclameAquiDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+às\s+(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0
  );
  return isNaN(date.getTime()) ? null : date;
}

export async function fetchReclameAquiComplaints(params: {
  storeSlug: string | null;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  if (!APIFY_TOKEN) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "APIFY_TOKEN não configurado no worker." };
  }
  if (!params.storeSlug) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "Slug da empresa no Reclame Aqui não configurado." };
  }

  const input = {
    nome_loja: params.storeSlug,
    max_reclamacoes: MAX_COMPLAINTS_PER_SYNC,
    // Corte de data nativo do ator (confirmado na documentação, formato DD/MM/AAAA) — permite
    // sincronização incremental real, diferente de TripAdvisor/Booking.
    ...(params.sinceDate
      ? {
          data_limite: [
            String(params.sinceDate.getDate()).padStart(2, "0"),
            String(params.sinceDate.getMonth() + 1).padStart(2, "0"),
            params.sinceDate.getFullYear(),
          ].join("/"),
        }
      : {}),
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

  let items: ApifyReclameAquiItem[];
  try {
    items = (await response.json()) as ApifyReclameAquiItem[];
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Resposta do Apify não é JSON válido: ${err?.message || err}` };
  }

  const reviews: NormalizedReviewInput[] = [];
  for (const item of items) {
    const externalId = item.id_reclamacao != null ? String(item.id_reclamacao) : null;
    if (!externalId) continue; // sem id não dá para deduplicar — descarta em vez de arriscar duplicar

    const publishedAt = parseReclameAquiDate(item.data) ?? new Date();
    // status_resultado ("Resolvido"/"Não resolvido") entra no body como contexto — não vira rating
    // (Reclame Aqui não tem nota de 0-5/0-10 comparável aos demais canais; nota_atendimento é uma
    // classificação separada do atendimento pós-reclamação, quando existe).
    const statusPrefix = item.status_resultado ? `[${item.status_resultado}] ` : "";
    reviews.push({
      externalId,
      rating: typeof item.nota_atendimento === "number" ? item.nota_atendimento : null,
      title: null,
      body: item.texto_principal ? `${statusPrefix}${item.texto_principal}` : null,
      authorName: item.cidade || null,
      url: item.link || null,
      publishedAt,
      rawData: item,
    });
  }

  return { reviewsFetched: items.length, reviews };
}
