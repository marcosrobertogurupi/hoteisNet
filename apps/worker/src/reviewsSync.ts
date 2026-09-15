// Sincronização de reviews externos (Google Maps, TripAdvisor, Booking, Facebook, Instagram,
// Reclame Aqui) — cada canal implementado vive em ./reviewConnectors/*.ts; este arquivo só
// orquestra: escolhe conectores devidos, chama o conector certo, normaliza/deduplica e persiste.
//
// GOOGLE_MAPS e TRIPADVISOR estão implementados (fetchChannelReviews trata os demais canais como
// "ainda não implementado", registrando isso como erro do ciclo — não quebra o worker). Análise de
// sentimento e alertas (HumanEscalation) entram na Fase 2.
import { PrismaClient, ReviewChannel, ReviewChannelConnector, TenantStatus } from "@prisma/client";
import { fetchGoogleMapsReviews } from "./reviewConnectors/googleMaps";
import { fetchTripAdvisorReviews } from "./reviewConnectors/tripadvisor";
import type { ReviewConnectorResult } from "./reviewConnectors/types";

const prisma = new PrismaClient();

const SYNC_BATCH_SIZE = 10;
// Guard-rail de custo: nunca sincroniza o mesmo conector com menos que este intervalo, mesmo que o
// cron dispare com mais frequência (o cron roda a cada 30min só para não deixar um conector devido
// esperando até 2h se o ciclo anterior não pegou todos — MIN_SYNC_INTERVAL_MINUTES é quem de fato
// espaça as chamadas pagas ao Apify).
const MIN_SYNC_INTERVAL_MINUTES = 120;
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
    default:
      // Booking, Facebook, Instagram e Reclame Aqui entram nas próximas etapas do módulo (ver plano
      // de implementação) — cada um replicando o mesmo padrão de googleMaps.ts/tripadvisor.ts.
      return { reviewsFetched: 0, reviews: [], errorMessage: `Canal ${connector.channel} ainda não implementado.` };
  }
}

async function syncConnector(connector: ReviewChannelConnector): Promise<void> {
  await prisma.reviewChannelConnector.update({ where: { id: connector.id }, data: { status: "RUNNING" } });

  const job = await prisma.reviewSyncJob.create({
    data: { connectorId: connector.id, tenantId: connector.tenantId, status: "running" },
  });

  try {
    const result = await fetchChannelReviews(connector);
    if (result.errorMessage) throw new Error(result.errorMessage);

    let reviewsNew = 0;
    let reviewsUpdated = 0;
    for (const r of result.reviews) {
      const key = { tenantId_channel_externalId: { tenantId: connector.tenantId, channel: connector.channel, externalId: r.externalId } };
      const existing = await prisma.review.findUnique({ where: key, select: { id: true, rating: true, body: true } });

      // Só reprocessa/reescreve quando nota ou texto mudaram desde a última coleta — evita write
      // desnecessário (e, na Fase 2, reprocessamento de sentimento) para um review que já conhecemos
      // e não mudou. Mesma otimização do projeto de referência que originou este módulo.
      const unchanged =
        !!existing && Number(existing.rating ?? -1) === (r.rating ?? -1) && (existing.body || "") === (r.body || "");
      if (unchanged) continue;

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
        },
        update: {
          rating: r.rating,
          title: r.title,
          body: r.body,
          authorName: r.authorName,
          url: r.url,
          rawData: r.rawData as any,
          collectedAt: new Date(),
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
