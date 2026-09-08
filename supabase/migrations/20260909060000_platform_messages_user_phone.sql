-- Painel Admin — Fase 6: comunicação com assinantes.
--
-- users.phone: WhatsApp da pessoa do hotel (opcional).
-- platform_message_logs: log dos envios da plataforma aos assinantes (1:1 e em massa).
--
-- Mudança aditiva na users (já com RLS); tabela nova entra com RLS sem policies (CLAUDE.md §11).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.platform_message_logs (
  id             text PRIMARY KEY,
  "tenantId"     text,
  "targetUserId" text,
  "targetPhone"  text NOT NULL,
  "targetLabel"  text,
  kind           text NOT NULL DEFAULT 'TEXT',
  body           text,
  "mediaFilename" text,
  "batchId"      text,
  status         text NOT NULL DEFAULT 'SENT',
  error          text,
  "sentById"     text,
  "sentByName"   text,
  "createdAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_message_logs_tenant_idx ON public.platform_message_logs ("tenantId");
CREATE INDEX IF NOT EXISTS platform_message_logs_batch_idx ON public.platform_message_logs ("batchId");
CREATE INDEX IF NOT EXISTS platform_message_logs_created_idx ON public.platform_message_logs ("createdAt");

ALTER TABLE public.platform_message_logs ENABLE ROW LEVEL SECURITY;
