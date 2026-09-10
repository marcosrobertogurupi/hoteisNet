-- Telemetria de IA faturável — Fase 1: captura completa do uso + modelo de IA por recurso +
-- preços versionados. O consumo de IA é revendido ao assinante como serviço extra, então cada
-- registro precisa ser reproduzível (modelo + preço vigente na data).
--
-- Tudo aditivo. ai_usage_logs já existe; as 3 tabelas novas nascem com RLS habilitado e sem
-- policy (negação total anon/authenticated — CLAUDE.md §11; o Prisma usa o papel dono).

-- 1. Colunas novas em ai_usage_logs (todas com default, seguras para o código antigo em produção).
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS "model"             text    NOT NULL DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS "provider"          text    NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS "tokensCachedInput" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tokensReasoning"   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "stepCount"         integer NOT NULL DEFAULT 1;

-- Amplia a precisão do custo — modelos baratos + leitura de cache geram valores < 1e-6.
ALTER TABLE public.ai_usage_logs ALTER COLUMN "totalCostUsd" TYPE numeric(12, 8);

-- Nomes iguais aos que o Prisma gera a partir de @@index (o projeto também roda `prisma db push`).
CREATE INDEX IF NOT EXISTS "ai_usage_logs_tenantId_createdAt_idx" ON public.ai_usage_logs ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_feature_createdAt_idx" ON public.ai_usage_logs ("feature", "createdAt");

-- 2. Default de modelo por recurso (nível plataforma).
CREATE TABLE IF NOT EXISTS public.ai_model_defaults (
  "feature"     text PRIMARY KEY,
  "model"       text NOT NULL,
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedById" text
);
-- A tabela pode ter sido criada antes por `prisma db push` (schema Prisma tem @updatedAt, sem
-- default no banco) — garante o default para os INSERT crus abaixo.
ALTER TABLE public.ai_model_defaults ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.ai_model_defaults ENABLE ROW LEVEL SECURITY;

-- 3. Override de modelo por (assinante, recurso) — prioridade sobre o default.
CREATE TABLE IF NOT EXISTS public.tenant_ai_model_overrides (
  "id"        text PRIMARY KEY,
  "tenantId"  text NOT NULL REFERENCES public.tenants("id") ON DELETE CASCADE,
  "feature"   text NOT NULL,
  "model"     text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "feature")
);
ALTER TABLE public.tenant_ai_model_overrides ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.tenant_ai_model_overrides ENABLE ROW LEVEL SECURITY;

-- 4. Preços versionados por modelo (USD por 1M de tokens).
CREATE TABLE IF NOT EXISTS public.ai_model_prices (
  "id"                      text PRIMARY KEY,
  "model"                   text NOT NULL,
  "provider"                text NOT NULL DEFAULT 'google',
  "inputPerMTokenUsd"       numeric(10, 4) NOT NULL,
  "cachedInputPerMTokenUsd" numeric(10, 4) NOT NULL,
  "outputPerMTokenUsd"      numeric(10, 4) NOT NULL,
  "effectiveFrom"           timestamptz NOT NULL,
  "note"                    text,
  "createdAt"               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ai_model_prices_model_effectiveFrom_idx" ON public.ai_model_prices ("model", "effectiveFrom");
ALTER TABLE public.ai_model_prices ENABLE ROW LEVEL SECURITY;

-- 5. Seed de preços — tabela pública do Google (tier pago, texto). CONFERIR na página de pricing e
--    corrigir aqui/na tela de admin; a data 2025-01-01 garante que cobre todo o histórico atual.
INSERT INTO public.ai_model_prices
  ("id","model","inputPerMTokenUsd","cachedInputPerMTokenUsd","outputPerMTokenUsd","effectiveFrom","note")
VALUES
  ('seed-gemini-2_5-flash',      'gemini-2.5-flash',      0.3000, 0.0750,  2.5000, '2025-01-01T00:00:00Z', 'Seed inicial — conferir pricing do Google'),
  ('seed-gemini-2_5-flash-lite', 'gemini-2.5-flash-lite', 0.1000, 0.0250,  0.4000, '2025-01-01T00:00:00Z', 'Seed inicial — conferir pricing do Google'),
  ('seed-gemini-2_5-pro',        'gemini-2.5-pro',        1.2500, 0.3100, 10.0000, '2025-01-01T00:00:00Z', 'Seed inicial — faixa <=200k tokens; conferir pricing do Google'),
  ('seed-gemini-2_0-flash',      'gemini-2.0-flash',      0.1000, 0.0250,  0.4000, '2025-01-01T00:00:00Z', 'Seed inicial — conferir pricing do Google')
ON CONFLICT ("id") DO NOTHING;

-- 6. Default de modelo por recurso — tudo no gemini-2.5-flash (o que já rodava hardcoded).
INSERT INTO public.ai_model_defaults ("feature","model")
VALUES
  ('whatsapp_guest_support',         'gemini-2.5-flash'),
  ('whatsapp_guest_support_summary', 'gemini-2.5-flash'),
  ('platform_support',               'gemini-2.5-flash'),
  ('operational_monitoring',         'gemini-2.5-flash'),
  ('operational_knowledge_drift',    'gemini-2.5-flash')
ON CONFLICT ("feature") DO NOTHING;
