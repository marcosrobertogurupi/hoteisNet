// Coleta de Facebook e Instagram via Graph API (Meta) — camada 1 (API oficial) do módulo de
// reviews para esses dois canais, priorizada sobre o fallback Apify (facebook.ts) por instrução
// explícita do assinante. Usa o Page Access Token obtido no OAuth
// (apps/web/src/app/api/tenant/reviews/meta/callback/route.ts), cifrado em
// ReviewChannelConnector.oauthAccessTokenEnc e decifrado aqui com ./--lib/secretBox.ts.
//
// Diferente do fallback Apify de facebook.ts (que raspa a aba "Avaliações" — recomendação sim/não),
// este caminho lê COMENTÁRIOS nas publicações da própria página/perfil via Graph API — o mesmo
// padrão de "social listening" usado no projeto de referência que originou este módulo. Não existe
// nota numérica nem "recomendação" aqui: `rating` fica sempre null, a análise de sentimento da Fase
// 2 é quem vai qualificar o comentário como positivo/negativo/crítico a partir do texto.
//
// Sem webhook em tempo real (ver decisão registrada no plano de implementação): o App do Meta
// reaproveitado já tem webhook registrado para outro produto (radar-views) e um App só aceita uma
// URL de callback por vez — este conector é 100% polling, como todos os outros do módulo.
import { decryptSecret } from "../lib/secretBox";
import type { NormalizedReviewInput, ReviewConnectorResult } from "./types";

const GRAPH_VERSION = "v20.0";

interface GraphComment {
  id: string;
  message?: string; // Facebook
  text?: string; // Instagram
  from?: { name?: string };
  username?: string; // Instagram
  created_time?: string; // Facebook, unix seconds como string
  timestamp?: string; // Instagram, ISO
}

function normalizeComment(item: GraphComment): NormalizedReviewInput | null {
  const body = item.message || item.text || null;
  if (!body) return null; // comentário sem texto (só emoji-reação, sticker etc.) não vira review

  const rawDate = item.created_time || item.timestamp;
  // Facebook manda unix seconds como string ("1694812345"); Instagram manda ISO.
  const publishedAt = rawDate
    ? /^\d+$/.test(rawDate)
      ? new Date(Number(rawDate) * 1000)
      : new Date(rawDate)
    : new Date();

  return {
    externalId: item.id,
    rating: null,
    title: null,
    body,
    authorName: item.from?.name || item.username || null,
    url: null,
    publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    rawData: item,
  };
}

export async function fetchFacebookCommentsViaGraph(params: {
  pageId: string;
  tokenEnc: string;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  const token = decryptSecret(params.tokenEnc);
  if (!token) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "Token OAuth do Facebook inválido — reconecte em Cadastros → Reviews." };
  }

  // Sem sinceDate (primeira sincronização), cobre os últimos 7 dias — não faz sentido varrer o
  // histórico inteiro de posts numa página com anos de comentários no primeiro ciclo.
  const sinceSeconds = Math.floor((params.sinceDate ? params.sinceDate.getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${params.pageId}/feed?fields=id,comments{id,from,message,created_time}&since=${sinceSeconds}&access_token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Falha de rede ao chamar a Graph API: ${err?.message || err}` };
  }
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Graph API respondeu erro: ${data?.error?.message || res.status}` };
  }

  let fetched = 0;
  const reviews: NormalizedReviewInput[] = [];
  for (const post of data?.data || []) {
    for (const comment of post.comments?.data || []) {
      fetched++;
      const normalized = normalizeComment(comment);
      if (normalized) reviews.push(normalized);
    }
  }
  return { reviewsFetched: fetched, reviews };
}

export async function fetchInstagramCommentsViaGraph(params: {
  igUserId: string;
  tokenEnc: string;
  sinceDate: Date | null;
}): Promise<ReviewConnectorResult> {
  const token = decryptSecret(params.tokenEnc);
  if (!token) {
    return { reviewsFetched: 0, reviews: [], errorMessage: "Token OAuth do Instagram inválido — reconecte em Cadastros → Reviews." };
  }

  // A Graph API não tem filtro "since" para /media — filtra no código depois de buscar.
  const cutoff = params.sinceDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${params.igUserId}/media?fields=id,comments{id,username,text,timestamp}&access_token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  } catch (err: any) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Falha de rede ao chamar a Graph API: ${err?.message || err}` };
  }
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    return { reviewsFetched: 0, reviews: [], errorMessage: `Graph API respondeu erro: ${data?.error?.message || res.status}` };
  }

  let fetched = 0;
  const reviews: NormalizedReviewInput[] = [];
  for (const media of data?.data || []) {
    for (const comment of media.comments?.data || []) {
      if (comment.timestamp && new Date(comment.timestamp) < cutoff) continue;
      fetched++;
      const normalized = normalizeComment(comment);
      if (normalized) reviews.push(normalized);
    }
  }
  return { reviewsFetched: fetched, reviews };
}
