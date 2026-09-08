-- Painel Admin da Plataforma SaaS — Fase 0 (fundação/segurança).
--
-- 1) Novos papéis da equipe do SaaS no enum UserRole (User com tenantId nulo, acesso ao /admin).
-- 2) Tabela platform_audit_logs — trilha global das ações do back-office.
--
-- RLS: a platform_audit_logs entra habilitada e SEM policies (negação total para os papéis
-- anon/authenticated do PostgREST), pelo mesmo motivo das migrations anteriores — a
-- NEXT_PUBLIC_SUPABASE_ANON_KEY fica embutida no bundle do frontend e o PostgREST expõe
-- /rest/v1/<tabela> para toda tabela sem RLS. O Prisma (DATABASE_URL) usa o papel dono e não é
-- afetado. Ver CLAUDE.md, Segurança §11.

-- 1) Novos valores do enum UserRole (idempotente)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PLATFORM_SUPPORT';

-- 2) Trilha de auditoria global da plataforma
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id               text PRIMARY KEY,
  "actorId"        text,
  "actorName"      text,
  "actorRole"      text,
  action           text NOT NULL,
  description      text,
  "targetTenantId" text,
  "entityType"     text,
  "entityId"       text,
  "ipAddress"      text,
  details          jsonb,
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_logs_target_tenant_idx
  ON public.platform_audit_logs ("targetTenantId");
CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx
  ON public.platform_audit_logs ("createdAt");

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
