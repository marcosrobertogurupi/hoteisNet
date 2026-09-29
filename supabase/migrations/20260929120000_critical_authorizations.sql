-- Autorização de eventos críticos — Fase 1 (motor + autorização local por senha).
--  * users."isAuthorizer": lista de autorizadores do hotel. Os TENANT_ADMIN existentes já nascem
--    autorizadores, para o desconto acima do limite continuar funcionando como hoje.
--  * cash_transactions.annulled*: lançamento de caixa NUNCA é excluído — é anulado (continua
--    visível, sai dos totais).
--  * critical_authorizations: solicitações + trilha de auditoria. RLS habilitado SEM policy
--    (negação total para anon/authenticated — CLAUDE.md §11; o Prisma usa o papel dono).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "isAuthorizer" boolean NOT NULL DEFAULT false;
UPDATE public.users SET "isAuthorizer" = true WHERE role = 'TENANT_ADMIN' AND "tenantId" IS NOT NULL;

ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS "annulledAt" timestamp(3);
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS "annulledById" text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS "annulledByName" text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS "annulReason" text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS "annulAuthorizationId" text;

CREATE TABLE IF NOT EXISTS public.critical_authorizations (
  "id"                text PRIMARY KEY,
  "tenantId"          text NOT NULL REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventType"         text NOT NULL,
  "status"            text NOT NULL DEFAULT 'PENDENTE',
  "fingerprintHash"   text NOT NULL,
  "summary"           text NOT NULL,
  "details"           jsonb,
  "justification"     text,
  "requestedById"     text NOT NULL,
  "requestedByName"   text NOT NULL,
  "requestedTerminal" text,
  "requestedIp"       text,
  "targetApproverId"  text,
  "decidedById"       text,
  "decidedByName"     text,
  "decisionChannel"   text,
  "decisionNote"      text,
  "decidedAt"         timestamp(3),
  "decidedIp"         text,
  "linkTokenHash"     text,
  "linkSentAt"        timestamp(3),
  "expiresAt"         timestamp(3) NOT NULL,
  "executedAt"        timestamp(3),
  "createdAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "critical_authorizations_linkTokenHash_key" ON public.critical_authorizations ("linkTokenHash");
CREATE INDEX IF NOT EXISTS "critical_authorizations_tenantId_createdAt_idx" ON public.critical_authorizations ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "critical_authorizations_tenantId_status_idx" ON public.critical_authorizations ("tenantId", "status");

ALTER TABLE public.critical_authorizations ENABLE ROW LEVEL SECURITY;
