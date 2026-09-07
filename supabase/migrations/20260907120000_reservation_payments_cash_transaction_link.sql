-- Sinal (adiantamento) da reserva passa a ser lançado no caixa do operador já na criação da
-- reserva, honrando as flags da forma de pagamento escolhida (soma caixa x conta corrente,
-- debitar saldo do hóspede) — ver apps/web/src/lib/paymentProcessing.ts (processReservationDeposit)
-- e a Fase 26 do PRD.md.
--
-- Esta coluna guarda o CashTransaction gerado por cada adiantamento. Fica NULL para reservas
-- antigas (cujo sinal só era lançado no check-in). No check-in, o CashTransaction referenciado
-- aqui é revinculado à hospedagem que nasce (stayCheckinId), para aparecer no histórico de
-- pagamentos do quarto.
--
-- Mudança aditiva (coluna nullable, sem default que exija reescrita da tabela). A tabela
-- reservation_payments já tem RLS habilitado desde 20260823220000_enable_rls_all_tables.sql.

ALTER TABLE public.reservation_payments
  ADD COLUMN IF NOT EXISTS "cashTransactionId" text;
