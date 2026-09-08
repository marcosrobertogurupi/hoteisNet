-- Painel Admin — Fase 3c: régua de inadimplência.
--
-- dunningStage: em que ponto da régua a assinatura está (null = em dia · WARNED_15 · SUSPENDED_30).
-- dunningNotifiedAt: quando o último aviso foi enviado (evita reenvio a cada ciclo do cron).
--
-- Mudança aditiva. saas_subscriptions já tem RLS habilitado.

ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS "dunningStage"      text,
  ADD COLUMN IF NOT EXISTS "dunningNotifiedAt" timestamptz;
