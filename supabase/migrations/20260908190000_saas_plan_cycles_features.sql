-- Painel Admin — Fase 2: catálogo de planos com ciclos e recursos.
--
-- SaaSPlan: preço semestral/anual (opcionais, já com desconto embutido — pagamento único
--   antecipado, decisão D5), lista de recursos inclusos (descrição comercial) e dias de trial.
-- SaASSubscription: ciclo contratado (MENSAL recorrente / SEMESTRAL / ANUAL).
--
-- Mudança aditiva. saas_plans e saas_subscriptions já têm RLS habilitado desde
-- 20260823220000_enable_rls_all_tables.sql.

DO $$ BEGIN
  CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'SEMIANNUAL', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS "priceSemiannual" numeric(10,2),
  ADD COLUMN IF NOT EXISTS "priceAnnual"     numeric(10,2),
  ADD COLUMN IF NOT EXISTS "features"        text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "trialDays"       integer NOT NULL DEFAULT 0;

ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';
