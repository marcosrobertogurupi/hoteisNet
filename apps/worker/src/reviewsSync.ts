// Sincronização de reviews externos (Google Maps, TripAdvisor, Booking, Facebook, Instagram,
// Reclame Aqui) — cada canal implementado vive em ./reviewConnectors/*.ts; este arquivo só
// orquestra: escolhe conectores devidos, chama o conector certo, normaliza/deduplica e persiste.
//
// Todos os 6 canais do módulo estão implementados, com análise de sentimento por IA. Alertas de
// review crítico (HumanEscalation) ainda não — próxima etapa.
import { PrismaClient, ReviewChannel, ReviewChannelConnector, TenantStatus } from "@prisma/client";
import { fetchGoogleMapsReviews } from "./reviewConnectors/googleMaps";
import { fetchTripAdvisorReviews } from "./reviewConnectors/tripadvisor";
import { fetchBookingReviews } from "./reviewConnectors/booking";
import { fetchFacebookReviews } from "./reviewConnectors/facebook";
import { fetchFacebookCommentsViaGraph, fetchInstagramCommentsViaGraph } from "./reviewConnectors/metaGraph";
import { fetchReclameAquiComplaints } from "./reviewConnectors/reclameAqui";
import { analyzeReviewSentiment } from "./reviewSentiment";
import type { NormalizedReviewInput, ReviewConnectorResult } from "./reviewConnectors/types";

const prisma = new PrismaClient();

const SYNC_BATCH_SIZE = 10;
// Guard-rail de custo E decisão de produto (pedido explícito do assinante): cada conector é
// sincronizado só 2x ao dia, nunca mais que isso — mesmo que o cron dispare com mais frequência (o
// cron roda a cada 30min só para não deixar um conector devido esperando até 12h se o ciclo
// anterior não pegou todos — MIN_SYNC_INTERVAL_MINUTES é quem de fato espaça as chamadas pagas ao
// Apify/Graph API).
const MIN_SYNC_INTERVAL_MINUTES = 12 * 60;
// Nenhum canal importa histórico — pedido explícito do assinante: "o comportamento de todos os
// canais é procurar reviews recentes e nunca histórico ... isso não importa para o hotel". Reviews
// publicados antes desta janela são descartados no pós-processamento (filterRecentReviews), mesmo
// que o conector/ator os tenha retornado — independe de cada canal saber ou não filtrar por data
// nativamente (TripAdvisor e Booking não têm esse parâmetro no ator, ver comentário nos respectivos
// conectores). Vale tanto na primeira sincronização (sem lastSyncAt) quanto nas seguintes.
const RECENCY_WINDOW_DAYS = 30;
// Conector travado em RUNNING por mais que isso é considerado uma sincronização que nunca terminou
// (worker reiniciado/crash no meio do ciclo) e é resetado automaticamente pelo watchdog abaixo.
const RUNNING_TIMEOUT_MINUTES = 20;
// Conector em erro só volta a ser tentado dentro desta janela desde o primeiro erro — depois disso
// fica "pausado" aguardando o assinante reconfigurar (mesmo padrão de janela de retry do projeto de
// referência que originou este módulo).
const RETRY_WINDOW_HOURS = 72;
const ERROR_BACKOFF_MINUTES = 30;

let reviewsSyncRunning = false;

export async function runReviewsSync(): Promise<void> {
  if (reviewsSyncRunning) {
    console.warn("[reviews-sync] ciclo anterior ainda em execução — disparo ignorado.");
    return;
  }
  reviewsSyncRunning = true;
  try {
    await resetStuckConnectors();
    await runReviewsSyncInner();
  } finally {
    reviewsSyncRunning = false;
  }
}

// Watchdog de conectores travados. Sem isso, um conector cujo worker morreu no meio de uma
// sincronização ficaria em RUNNING para sempre — o filtro de "devidos" abaixo só busca
// ACTIVE/ERROR, então RUNNING nunca mais seria pego de volta. firstErrorAt é setado aqui também
// (não só no caminho normal de falha, ver syncConnector) — senão o conector reiniciado ficaria fora
// da janela de retry de 72h para sempre. Lição aprendida diretamente de um incidente documentado no
// projeto de referência que originou este módulo (dois bugs corretivos em produção por causa disso).
async function resetStuckConnectors(): Promise<void> {
  const cutoff = new Date(Date.now() - RUNNING_TIMEOUT_MINUTES * 60 * 1000);
  const stuck = await prisma.reviewChannelConnector.findMany({
    where: { status: "RUNNING", updatedAt: { lt: cutoff } },
    select: { id: true, firstErrorAt: true },
  });
  for (const c of stuck) {
    await prisma.reviewChannelConnector.update({
      where: { id: c.id },
      data: {
        status: "ERROR",
        errorMessage: "Sincronização travada — resetada automaticamente pelo worker.",
        firstErrorAt: c.firstErrorAt ?? new Date(),
        nextSyncAt: new Date(Date.now() + ERROR_BACKOFF_MINUTES * 60 * 1000),
      },
    });
    console.warn(`[reviews-sync] conector travado resetado — id=${c.id}`);
  }
}

async function runReviewsSyncInner(): Promise<void> {
  const now = new Date();
  const retryWindowStart = new Date(now.getTime() - RETRY_WINDOW_HOURS * 60 * 60 * 1000);

  const due = await prisma.reviewChannelConnector.findMany({
    where: {
      externalId: { not: null },
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }],
      AND: [
        {
          OR: [
            { status: "ACTIVE" },
            { status: "ERROR", firstErrorAt: { gte: retryWindowStart } },
          ],
        },
      ],
      tenant: { status: { notIn: [TenantStatus.SUSPENDED, TenantStatus.CANCELLED] } },
    },
    take: SYNC_BATCH_SIZE,
    orderBy: { nextSyncAt: "asc" },
  });

  for (const connector of due) {
    await syncConnector(connector);
  }
}

async function fetchChannelReviews(connector: ReviewChannelConnector): Promise<ReviewConnectorResult> {
  switch (connector.channel) {
    case ReviewChannel.GOOGLE_MAPS:
      return fetchGoogleMapsReviews({ placeId: connector.externalId, sinceDate: connector.lastSyncAt });
    case ReviewChannel.TRIPADVISOR:
      return fetchTripAdvisorReviews({ listingUrl: connector.externalId, sinceDate: connector.lastSyncAt });
    case ReviewChannel.BOOKING:
      return fetchBookingReviews({ hotelUrl: connector.externalId, sinceDate: connector.lastSyncAt });
    case ReviewChannel.FACEBOOK:
      // Camada 1 (API oficial via OAuth) tem prioridade sobre a camada 2 (Apify) por instrução
      // explícita do assinante — inverso da ordem usada no projeto de referência que originou este
      // módulo, onde Apify era a estratégia principal e a Graph API só o fallback.
      if (connector.oauthAccessTokenEnc) {
        return fetchFacebookCommentsViaGraph({
          pageId: connector.externalId!,
          tokenEnc: connector.oauthAccessTokenEnc,
          sinceDate: connector.lastSyncAt,
        });
      }
      return fetchFacebookReviews({ pageUrl: connector.externalId, sinceDate: connector.lastSyncAt });
    case ReviewChannel.INSTAGRAM:
      // Sem fallback Apify nesta fase — Instagram não tem um conceito nativo de "review" como os
      // demais canais (nem sequer nota), só comentários/menções; a coleta via Apify desse tipo de
      // dado fica para uma próxima etapa se a OAuth não se mostrar suficiente na prática.
      if (connector.oauthAccessTokenEnc) {
        return fetchInstagramCommentsViaGraph({
          igUserId: connector.externalId!,
          tokenEnc: connector.oauthAccessTokenEnc,
          sinceDate: connector.lastSyncAt,
        });
      }
      return { reviewsFetched: 0, reviews: [], errorMessage: "Conecte o Instagram via OAuth em Cadastros → Reviews." };
    case ReviewChannel.RECLAME_AQUI:
      return fetchReclameAquiComplaints({ storeSlug: connector.externalId, sinceDate: connector.lastSyncAt });
    default:
      return { reviewsFetched: 0, reviews: [], errorMessage: `Canal ${connector.channel} ainda não implementado.` };
  }
}

// Descarta reviews publicados antes de RECENCY_WINDOW_DAYS, mesmo que o conector/ator os tenha
// retornado — a garantia de "só recente" fica centralizada aqui em vez de espalhada por canal, já
// que nem todo ator suporta corte de data nativo (ver comentário de RECENCY_WINDOW_DAYS acima).
function filterRecentReviews(reviews: NormalizedReviewInput[]): NormalizedReviewInput[] {
  const cutoff = new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return reviews.filter((r) => r.publishedAt >= cutoff);
}

async function syncConnector(connector: ReviewChannelConnector): Promise<void> {
  await prisma.reviewChannelConnector.update({ where: { id: connector.id }, data: { status: "RUNNING" } });

  const job = await prisma.reviewSyncJob.create({
    data: { connectorId: connector.id, tenantId: connector.tenantId, status: "running" },
  });

  try {
    const result = await fetchChannelReviews(connector);
    if (result.errorMessage) throw new Error(result.errorMessage);

    const recentReviews = filterRecentReviews(result.reviews);

    // Buscado uma vez por ciclo de sincronização (não por review) — usado para o prompt da IA e
    // para respeitar o kill switch do assinante (AIAgentSetting.blocked desliga os dois agentes de
    // IA do hotel; a análise de sentimento de reviews entra nesse mesmo interruptor em vez de ganhar
    // um próprio, para não multiplicar toggles de "desligar IA" que o admin precisa lembrar de checar).
    let hotelName = "o hotel";
    let aiBlocked = false;
    if (recentReviews.length > 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: connector.tenantId },
        select: { name: true, tradeName: true, aiAgentSettings: { select: { blocked: true } } },
      });
      hotelName = tenant?.tradeName || tenant?.name || hotelName;
      aiBlocked = tenant?.aiAgentSettings?.blocked ?? false;
    }

    let reviewsNew = 0;
    let reviewsUpdated = 0;
    for (const r of recentReviews) {
      const key = { tenantId_channel_externalId: { tenantId: connector.tenantId, channel: connector.channel, externalId: r.externalId } };
      const existing = await prisma.review.findUnique({ where: key, select: { id: true, rating: true, body: true } });

      // Só reprocessa/reescreve (inclusive a análise de sentimento) quando nota ou texto mudaram
      // desde a última coleta — evita write e chamada de IA desnecessários para um review que já
      // conhecemos e não mudou. Mesma otimização do projeto de referência que originou este módulo.
      const unchanged =
        !!existing && Number(existing.rating ?? -1) === (r.rating ?? -1) && (existing.body || "") === (r.body || "");
      if (unchanged) continue;

      const sentiment = aiBlocked
        ? null
        : await analyzeReviewSentiment(prisma, {
            tenantId: connector.tenantId,
            hotelName,
            channel: connector.channel,
            rating: r.rating ?? null,
            body: r.body ?? null,
            authorName: r.authorName ?? null,
          });

      await prisma.review.upsert({
        where: key,
        create: {
          tenantId: connector.tenantId,
          connectorId: connector.id,
          channel: connector.channel,
          externalId: r.externalId,
          rating: r.rating,
          title: r.title,
          body: r.body,
          authorName: r.authorName,
          url: r.url,
          publishedAt: r.publishedAt,
          rawData: r.rawData as any,
          ...(sentiment
            ? {
                sentiment: sentiment.sentiment,
                sentimentResult: sentiment as any,
                // Rascunho fica sempre pendente de aprovação nesta fase — nada publica de fato no
                // canal ainda (ver comentário no topo de reviewSentiment.ts).
                responseText: sentiment.replyDraft,
                responseStatus: sentiment.replyDraft ? "PENDING_APPROVAL" : "NONE",
              }
            : {}),
        },
        update: {
          rating: r.rating,
          title: r.title,
          body: r.body,
          authorName: r.authorName,
          url: r.url,
          rawData: r.rawData as any,
          collectedAt: new Date(),
          ...(sentiment
            ? {
                sentiment: sentiment.sentiment,
                sentimentResult: sentiment as any,
                responseText: sentiment.replyDraft,
                responseStatus: sentiment.replyDraft ? "PENDING_APPROVAL" : "NONE",
              }
            : {}),
        },
      });
      if (existing) reviewsUpdated++;
      else reviewsNew++;
    }

    await prisma.reviewSyncJob.update({
      where: { id: job.id },
      data: { status: "done", finishedAt: new Date(), reviewsFetched: result.reviewsFetched, reviewsNew, reviewsUpdated },
    });

    await prisma.reviewChannelConnector.update({
      where: { id: connector.id },
      data: {
        status: "ACTIVE",
        lastSyncAt: new Date(),
        nextSyncAt: new Date(Date.now() + MIN_SYNC_INTERVAL_MINUTES * 60 * 1000),
        errorMessage: null,
        errorCount: 0,
        firstErrorAt: null,
      },
    });
    console.log(`[reviews-sync] ok — tenant=${connector.tenantId} canal=${connector.channel} novos=${reviewsNew} atualizados=${reviewsUpdated}`);
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 500);
    await prisma.reviewSyncJob
      .update({ where: { id: job.id }, data: { status: "failed", finishedAt: new Date(), errorMessage: message } })
      .catch(() => {});

    await prisma.reviewChannelConnector.update({
      where: { id: connector.id },
      data: {
        status: "ERROR",
        errorMessage: message,
        errorCount: { increment: 1 },
        firstErrorAt: connector.firstErrorAt ?? new Date(),
        nextSyncAt: new Date(Date.now() + ERROR_BACKOFF_MINUTES * 60 * 1000),
      },
    });
    console.error(`[reviews-sync] falha — tenant=${connector.tenantId} canal=${connector.channel}:`, message);
  }
}
