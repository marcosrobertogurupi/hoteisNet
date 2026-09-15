-- Módulo de monitoramento de reviews (Google Maps, TripAdvisor, Booking, Facebook, Instagram,
-- Reclame Aqui) — Fase técnica 1: schema de coleta. Espelha os models ReviewChannelConnector,
-- Review e ReviewSyncJob de packages/database/prisma/schema.prisma (aplicado via `prisma db push`;
-- este arquivo existe só para habilitar RLS, mas usa CREATE TABLE/TYPE IF NOT EXISTS por segurança
-- caso rode antes do db push em algum ambiente).
--
-- Os campos enum do Prisma (channel/status/sentiment/responseStatus) mapeiam para tipos ENUM
-- nativos do Postgres, não para "text" — os nomes dos tipos abaixo têm que bater exatamente com os
-- nomes dos enums em schema.prisma (nenhum deles usa @map), senão o Prisma Client falha em runtime
-- com "type ... does not exist" ao tentar ler/escrever a coluna.

DO $$ BEGIN
  CREATE TYPE "ReviewChannel" AS ENUM ('GOOGLE_MAPS', 'TRIPADVISOR', 'BOOKING', 'FACEBOOK', 'INSTAGRAM', 'RECLAME_AQUI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewConnectorStatus" AS ENUM ('PENDING_AUTH', 'ACTIVE', 'PAUSED', 'ERROR', 'RUNNING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewSentiment" AS ENUM ('UNANALYZED', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewResponseStatus" AS ENUM ('NONE', 'DRAFT', 'PENDING_APPROVAL', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.review_channel_connectors (
  "id"           text PRIMARY KEY,
  "tenantId"     text NOT NULL,
  "channel"      "ReviewChannel" NOT NULL,
  "status"       "ReviewConnectorStatus" NOT NULL DEFAULT 'PENDING_AUTH',
  "externalId"   text,
  "config"       jsonb NOT NULL DEFAULT '{}',
  "lastSyncAt"   timestamp(3),
  "nextSyncAt"   timestamp(3),
  "errorMessage" text,
  "errorCount"   integer NOT NULL DEFAULT 0,
  "firstErrorAt" timestamp(3),
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "review_channel_connectors_tenantId_channel_key" UNIQUE ("tenantId", "channel")
);

CREATE TABLE IF NOT EXISTS public.reviews (
  "id"              text PRIMARY KEY,
  "tenantId"        text NOT NULL,
  "connectorId"     text NOT NULL,
  "channel"         "ReviewChannel" NOT NULL,
  "externalId"      text NOT NULL,
  "rating"          numeric(2,1),
  "title"           text,
  "body"            text,
  "authorName"      text,
  "url"             text,
  "publishedAt"     timestamp(3) NOT NULL,
  "collectedAt"     timestamp(3) NOT NULL DEFAULT now(),
  "sentiment"       "ReviewSentiment" NOT NULL DEFAULT 'UNANALYZED',
  "sentimentResult" jsonb,
  "responseText"    text,
  "responseStatus"  "ReviewResponseStatus" NOT NULL DEFAULT 'NONE',
  "rawData"         jsonb,
  CONSTRAINT "reviews_tenantId_channel_externalId_key" UNIQUE ("tenantId", "channel", "externalId")
);

CREATE INDEX IF NOT EXISTS "reviews_tenantId_channel_publishedAt_idx"
  ON public.reviews ("tenantId", "channel", "publishedAt");

CREATE TABLE IF NOT EXISTS public.review_sync_jobs (
  "id"             text PRIMARY KEY,
  "connectorId"    text NOT NULL,
  "tenantId"       text NOT NULL,
  "status"         text NOT NULL DEFAULT 'running',
  "startedAt"      timestamp(3) NOT NULL DEFAULT now(),
  "finishedAt"     timestamp(3),
  "reviewsFetched" integer NOT NULL DEFAULT 0,
  "reviewsNew"     integer NOT NULL DEFAULT 0,
  "reviewsUpdated" integer NOT NULL DEFAULT 0,
  "errorMessage"   text
);

CREATE INDEX IF NOT EXISTS "review_sync_jobs_connectorId_startedAt_idx"
  ON public.review_sync_jobs ("connectorId", "startedAt");

-- RLS ligado e ZERO policies = negação total para anon/authenticated (a NEXT_PUBLIC_SUPABASE_ANON_KEY
-- vai embutida no bundle do frontend e o PostgREST expõe automaticamente qualquer tabela sem RLS).
-- O Prisma usa o papel dono da tabela e não é afetado. Ver CLAUDE.md, Segurança §11.
ALTER TABLE public.review_channel_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_sync_jobs ENABLE ROW LEVEL SECURITY;
