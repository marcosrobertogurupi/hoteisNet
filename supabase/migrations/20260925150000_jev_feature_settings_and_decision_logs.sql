-- Jev (modelo de decisão da TypeSafe via OpenRouter) — Fase 1: configuração por recurso (modo
-- OFF/SHADOW/ACTIVE, só o admin master) e registro de cada decisão para calibrar limites.
-- As 2 tabelas nascem com RLS habilitado e SEM policy (negação total para anon/authenticated —
-- CLAUDE.md §11; o Prisma usa o papel dono e não é afetado).

DO $$ BEGIN
  CREATE TYPE "JevMode" AS ENUM ('OFF', 'SHADOW', 'ACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.jev_feature_settings (
  "feature"     text PRIMARY KEY,
  "mode"        "JevMode" NOT NULL DEFAULT 'OFF',
  "model"       text NOT NULL DEFAULT 'typesafe/jev-1.13',
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" text
);

CREATE TABLE IF NOT EXISTS public.jev_decision_logs (
  "id"              text PRIMARY KEY,
  "tenantId"        text NOT NULL REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "feature"         text NOT NULL,
  "mode"            "JevMode" NOT NULL,
  "subjectRef"      text,
  "answers"         jsonb,
  "decision"        text,
  "observedOutcome" text,
  "durationMs"      integer NOT NULL,
  "costUsd"         numeric(12, 8) NOT NULL,
  "error"           text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "jev_decision_logs_tenantId_createdAt_idx" ON public.jev_decision_logs ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "jev_decision_logs_feature_createdAt_idx" ON public.jev_decision_logs ("feature", "createdAt");

ALTER TABLE public.jev_feature_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jev_decision_logs ENABLE ROW LEVEL SECURITY;

-- Preço do Jev no OpenRouter (US$ 0,042 por 1M tokens de entrada; saída grátis). O custo gravado em
-- AIUsageLog usa o `usage.cost` exato devolvido pelo OpenRouter — esta linha é referência/fallback.
INSERT INTO public.ai_model_prices ("id", "model", "provider", "inputPerMTokenUsd", "cachedInputPerMTokenUsd", "outputPerMTokenUsd", "effectiveFrom", "note")
VALUES ('seed-typesafe-jev-1_13', 'typesafe/jev-1.13', 'openrouter', 0.0420, 0.0420, 0.0000, '2026-09-17T00:00:00Z', 'Jev via OpenRouter — preço do endpoint TypeSafe em 25/09/2026')
ON CONFLICT ("id") DO NOTHING;
