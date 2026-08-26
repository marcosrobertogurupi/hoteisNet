-- Governança de Quartos no modo "Fila de quartos": arrumação diária de quarto ocupado + "não perturbe".
--
-- Contexto (ver PLANO_GOVERNANCA_FILA.md): no modo QUEUE a fila hoje mostra "quarto sem tarefa
-- aberta", sem olhar o status do quarto — então quarto ocupado entra na fila e reaparece assim que
-- é limpo. Passa a existir uma HousekeepingTask OCCUPIED por quarto ocupado por dia
-- (housekeeping_tasks.serviceDate), gerada automaticamente, e um novo desfecho SKIPPED para quando
-- a governanta chega à porta, vê o aviso de "não perturbe" e registra isso no app dela.

-- 1. Novo desfecho de tarefa. ADD VALUE não pode ser usado na mesma transação em que é criado;
--    esta migração não usa 'SKIPPED' em nenhum comando de dados abaixo, então é seguro.
ALTER TYPE public."HousekeepingTaskStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

-- 2. Motivo do encerramento sem limpeza.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HousekeepingSkipReason') THEN
    CREATE TYPE public."HousekeepingSkipReason" AS ENUM ('DO_NOT_DISTURB', 'OTHER');
  END IF;
END
$$;

-- 3. Colunas novas em housekeeping_tasks.
--    serviceDate: dia (meia-noite de Brasília) da arrumação diária; NULL para checkout e
--    atribuições manuais da recepção.
ALTER TABLE public.housekeeping_tasks
  ADD COLUMN IF NOT EXISTS "skipReason"  public."HousekeepingSkipReason",
  ADD COLUMN IF NOT EXISTS "serviceDate" TIMESTAMP(3);

-- 4. No máximo uma arrumação diária por quarto por dia. Linhas antigas têm serviceDate NULL e, no
--    Postgres, NULLs não colidem em índice único de múltiplas colunas — nada a corrigir no backfill.
CREATE UNIQUE INDEX IF NOT EXISTS "housekeeping_tasks_roomId_type_serviceDate_key"
  ON public.housekeeping_tasks ("roomId", "type", "serviceDate");

CREATE INDEX IF NOT EXISTS "housekeeping_tasks_tenantId_serviceDate_idx"
  ON public.housekeeping_tasks ("tenantId", "serviceDate");

-- 5. Parâmetros por assinante (só valem no modo QUEUE).
ALTER TABLE public.housekeeping_settings
  ADD COLUMN IF NOT EXISTS "autoDailyArrumacao"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "arrumacaoSkipCheckinDay" BOOLEAN NOT NULL DEFAULT true;
