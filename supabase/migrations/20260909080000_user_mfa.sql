-- Painel Admin — Fase 7: 2FA (TOTP) para a equipe do painel.
--
-- Mudança aditiva na users (já com RLS).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "mfaSecret"  text,
  ADD COLUMN IF NOT EXISTS "mfaEnabled" boolean NOT NULL DEFAULT false;
