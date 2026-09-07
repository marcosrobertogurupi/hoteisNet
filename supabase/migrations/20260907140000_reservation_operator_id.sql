-- Atribuição por operador (id estável, não só o nome) de quem criou a reserva e de quem lançou
-- cada adiantamento — mesmo padrão de StayCheckin.checkedInByUserId / CashRegister.operatorId /
-- AuditLog.userId. O operatorName sozinho é frágil: cai no default "RECEPÇÃO" quando o contexto
-- de operador não está setado, e nome não é identificador de auditoria. Ver Fase 26.3 do PRD.md.
--
-- Mudança aditiva (colunas nullable, sem default que exija reescrita). As tabelas já têm RLS
-- habilitado desde 20260823220000_enable_rls_all_tables.sql.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS "operatorId" text;

ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS "operatorId" text;
