-- Adiciona o rastreamento de envio do alerta em operational_alert_logs.
--
-- Contexto: o Agente Operacional (apps/worker/src/operationalAgent.ts) passou a CRIAR a linha de
-- operational_alert_logs ANTES de enviar o alerta por WhatsApp, usando o índice único
-- (tenantId, issueType, entityId) como trava contra ciclos concorrentes do worker que antes
-- disparavam o mesmo alerta em duplicidade (duas mensagens no WhatsApp + duas escalações no sino).
--
--  - notifiedAt: instante em que o envio ao WhatsApp foi confirmado. NULL = ainda não enviado;
--    os próximos ciclos re-tentam só o envio (sem recriar a escalação) até notifyAttempts atingir
--    o teto no código (NOTIFY_MAX_ATTEMPTS).
--  - notifyAttempts: nº de tentativas de envio já feitas, para não tentar pra sempre um alerta
--    que nunca sai (ex.: o próprio WHATSAPP_DISCONNECTED).
--
-- Backfill: toda linha pré-existente já foi alertada com sucesso no modelo antigo (a linha só era
-- gravada após um envio OK), então marca notifiedAt = firstAlertedAt para não re-disparar um alerta
-- antigo no primeiro ciclo após o deploy.

ALTER TABLE public.operational_alert_logs
  ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notifyAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE public.operational_alert_logs
  SET "notifiedAt" = "firstAlertedAt"
  WHERE "notifiedAt" IS NULL;
