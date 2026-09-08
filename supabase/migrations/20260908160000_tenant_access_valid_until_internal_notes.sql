-- Painel Admin — Fase 1: cadastro de assinante.
--
-- accessValidUntil: data-limite "pago até" do assinante (equivalente ao Hot_DTReset do WinDev, o
--   kill-switch de licença). Atualizada pelos webhooks do Asaas na Fase 3; ajustável pelo admin.
-- internalNotes: anotações internas da equipe do SaaS sobre o assinante — nunca vistas pelo assinante.
--
-- Mudança aditiva (colunas nullable). A tabela tenants já tem RLS habilitado desde
-- 20260823220000_enable_rls_all_tables.sql.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "accessValidUntil" timestamptz,
  ADD COLUMN IF NOT EXISTS "internalNotes"    text;
