-- Telemetria de IA faturável — Fase 4: reconciliação mensal do custo calculado pelo sistema contra
-- a fatura real do Google. Sem integração automática com o Cloud Billing ainda — a equipe digita o
-- valor da fatura e o painel mostra o desvio %.
--
-- Tabela nova entra com RLS habilitado e sem policy — CLAUDE.md §11.

CREATE TABLE IF NOT EXISTS public.ai_cost_reconciliations (
  "id"                 text PRIMARY KEY,
  "periodMonth"        text NOT NULL UNIQUE,
  "providerInvoiceUsd" numeric(12, 4) NOT NULL,
  "note"               text,
  "enteredByName"      text,
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_cost_reconciliations ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.ai_cost_reconciliations ENABLE ROW LEVEL SECURITY;
