-- Painel Admin — Fase 3: cobrança via Asaas.
--
-- Tenant.asaasCustomerId: id do cliente no Asaas (null = cobrança manual).
-- SaASSubscription: forma de cobrança + ids do Asaas (assinatura recorrente para MENSAL,
--   pagamento único para SEMESTRAL/ANUAL).
-- saas_invoices: espelho local de cada cobrança do Asaas (ou avulsa quando manual = true) —
--   o webhook mantém status/paidAt/URLs; a régua de inadimplência do worker lê status/dueDate.
--
-- Toda tabela nova entra com RLS habilitado e SEM policies (negação total anon/authenticated;
-- o Prisma usa o papel dono e não é afetado). Ver CLAUDE.md, Segurança §11.

DO $$ BEGIN
  CREATE TYPE "SaaSInvoiceStatus" AS ENUM
    ('PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'CHARGEBACK', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "asaasCustomerId" text;

ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS "billingType"         text NOT NULL DEFAULT 'UNDEFINED',
  ADD COLUMN IF NOT EXISTS "asaasSubscriptionId" text,
  ADD COLUMN IF NOT EXISTS "asaasPaymentId"      text;

CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id               text PRIMARY KEY,
  "tenantId"       text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "subscriptionId" text REFERENCES public.saas_subscriptions(id),
  "asaasPaymentId" text UNIQUE,
  cycle            "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  amount           numeric(10,2) NOT NULL,
  "billingType"    text,
  status           "SaaSInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "dueDate"        timestamptz NOT NULL,
  "paidAt"         timestamptz,
  "invoiceUrl"     text,
  "bankSlipUrl"    text,
  "pixPayload"     text,
  description      text,
  manual           boolean NOT NULL DEFAULT false,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_invoices_tenant_idx ON public.saas_invoices ("tenantId");
CREATE INDEX IF NOT EXISTS saas_invoices_status_idx ON public.saas_invoices (status);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;
