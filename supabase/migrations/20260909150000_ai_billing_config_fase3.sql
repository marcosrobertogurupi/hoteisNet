-- Telemetria de IA faturável — Fase 3: config de faturamento (câmbio + margem) para calcular
-- custo × preço × margem por assinante no painel do admin master. Nunca exposto ao assinante.
--
-- Tabela nova (linha única "singleton") entra com RLS habilitado e sem policy — CLAUDE.md §11.

CREATE TABLE IF NOT EXISTS public.ai_billing_config (
  "id"            text PRIMARY KEY DEFAULT 'singleton',
  "usdToBrlRate"  numeric(10, 4) NOT NULL DEFAULT 5.0,
  "rateUpdatedAt" timestamptz,
  "markupPct"     integer NOT NULL DEFAULT 100,
  "updatedByName" text,
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_billing_config ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.ai_billing_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_billing_config ("id") VALUES ('singleton') ON CONFLICT ("id") DO NOTHING;
