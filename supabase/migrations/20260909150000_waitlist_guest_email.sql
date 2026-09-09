-- Fila de espera: campo de e-mail do hóspede.
--
-- O aviso de vaga aberta passa a ser disparado por e-mail (canal principal) e também por WhatsApp
-- quando há telefone validado. O modal "Adicionar à fila de espera" agora captura o e-mail — e,
-- ao informar o CPF, tenta preencher nome/telefone/e-mail automaticamente (cadastro local ou Hub
-- do Desenvolvedor).
--
-- Alteração aditiva — waitlist_entries já tem RLS habilitado (ver 20260909130000_waitlist_entries.sql).

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS "guestEmail" text;
