-- Alinha o banco ao schema.prisma — drift acumulado antes de 24/09/2026
--
-- `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel schema.prisma` apontava
-- divergências que fariam um `prisma db push` futuro falhar no meio (índice que já existe) ou
-- aplicar de uma vez mudanças que ninguém revisou. Investigação (só leitura) em produção, 24/09/2026:
--
--   1) FKs das tabelas de reviews: as migrations 20260915* criaram as tabelas sem REFERENCES (e
--      foram rodadas fora do `supabase db push`, por isso nem aparecem em
--      supabase_migrations.schema_migrations). Sem as FKs, o `onDelete: Cascade` declarado no
--      schema não existe: apagar um conector/tenant/estadia deixa filhos órfãos. Já havia 1:
--      review_sync_jobs 58d3cbbb-… (tenant demo, job 'failed' de 15/09 "APIFY_TOKEN não
--      configurado", conector apagado à mão). Os demais filhos estavam íntegros (0 órfãos, 0
--      divergências de tenant entre filho e pai).
--   2) reservations_reservationNumber_key: a migration 20260910120000 criou o índice PARCIAL
--      (`WHERE "reservationNumber" IS NOT NULL`). O Prisma 6 ignora índices parciais, então o
--      `db push` tentaria `CREATE UNIQUE INDEX "reservations_reservationNumber_key"` e quebraria
--      com "relation already exists". Troca-se por um índice único comum, mesmo nome: no Postgres
--      um índice único já aceita vários NULL, então a regra é idêntica (0 duplicados em 84
--      números, 38 reservas sem número).
--   3) Colunas de data: ai_billing_config (rateUpdatedAt, updatedAt) e ai_cost_reconciliations
--      (createdAt, updatedAt) nasceram timestamptz(6), mas o schema declara DateTime puro
--      (timestamp(3)) como o resto do projeto, inclusive as tabelas irmãs ai_model_defaults /
--      ai_model_prices. Converte-se para timestamp(3) em UTC — convenção do Prisma, e o fuso da
--      sessão em produção é UTC, então os valores não mudam (só a precisão cai para ms).
--      Os DEFAULT now() dos updatedAt (aqui e em ai_model_defaults, tenant_ai_model_overrides e
--      review_channel_connectors) estão CERTOS no banco: os seeds das migrations 20260909100000 e
--      20260909150000 fazem INSERT cru sem updatedAt. Quem mudou foi o schema (passou a declarar
--      `@default(now()) @updatedAt`, mesmo padrão de Reservation.updatedAt); aqui só se garante o
--      default.
--
-- Com o schema.prisma deste mesmo commit (master já com a manutenção de quartos, PR #46), o
-- `migrate diff` contra produção acusa exatamente os itens 1–3 acima e nada mais (conferido em
-- 24/09/2026) — ou seja, depois desta migration o diff deve ficar vazio.
--
-- Idempotente: cada passo confere o estado antes de agir; rodar de novo não faz nada.
-- Tabelas pequenas (≤ 536 linhas), então as travas duram milissegundos; o lock_timeout faz a
-- migration desistir em vez de enfileirar atrás de uma transação longa (o polling dos mapas lê
-- reservations a cada 3 s).

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------
-- 1) FKs de reviews
-- ---------------------------------------------------------------------------------------------

-- 1a) Remove órfãos — exatamente o que o ON DELETE CASCADE teria apagado se a FK existisse.
--     Ordem importa: conector sem tenant sai primeiro, e aí os filhos dele viram órfãos também.
DO $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.review_channel_connectors c
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = c."tenantId");
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE NOTICE 'review_channel_connectors órfãos (tenant) removidos: %', n; END IF;

  DELETE FROM public.reviews r
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = r."tenantId")
     OR NOT EXISTS (SELECT 1 FROM public.review_channel_connectors c WHERE c.id = r."connectorId");
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE NOTICE 'reviews órfãos removidos: %', n; END IF;

  DELETE FROM public.review_sync_jobs j
  WHERE NOT EXISTS (SELECT 1 FROM public.review_channel_connectors c WHERE c.id = j."connectorId");
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE NOTICE 'review_sync_jobs órfãos removidos: %', n; END IF;

  DELETE FROM public.review_feedback_requests f
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = f."tenantId")
     OR NOT EXISTS (SELECT 1 FROM public.stay_checkins s WHERE s.id = f."stayCheckinId");
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN RAISE NOTICE 'review_feedback_requests órfãos removidos: %', n; END IF;
END $$;

-- 1b) Cria as FKs com nome e regras idênticos aos que o Prisma gera (ON DELETE CASCADE ON UPDATE
--     CASCADE — mesmo formato de pre_checkin_links_tenantId_fkey), senão o diff continua acusando.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('review_channel_connectors', 'review_channel_connectors_tenantId_fkey',   'tenantId',      'tenants'),
      ('reviews',                   'reviews_tenantId_fkey',                     'tenantId',      'tenants'),
      ('reviews',                   'reviews_connectorId_fkey',                  'connectorId',   'review_channel_connectors'),
      ('review_sync_jobs',          'review_sync_jobs_connectorId_fkey',         'connectorId',   'review_channel_connectors'),
      ('review_feedback_requests',  'review_feedback_requests_tenantId_fkey',    'tenantId',      'tenants'),
      ('review_feedback_requests',  'review_feedback_requests_stayCheckinId_fkey','stayCheckinId', 'stay_checkins')
    ) AS v(tbl, conname, col, ref_tbl)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk.conname AND conrelid = format('public.%I', fk.tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I("id") ON DELETE CASCADE ON UPDATE CASCADE',
        fk.tbl, fk.conname, fk.col, fk.ref_tbl
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2) reservations_reservationNumber_key: índice parcial → índice único comum (mesmo nome)
-- ---------------------------------------------------------------------------------------------
-- Tudo num único DO (atômico): nunca há um instante sem índice único. Se aparecer número
-- duplicado até lá, o CREATE falha e nada muda — de propósito (dedup exige decisão, ver
-- 20260910120000).
DO $$
DECLARE
  partial boolean;
BEGIN
  SELECT ix.indpred IS NOT NULL INTO partial
  FROM pg_index ix
  JOIN pg_class i ON i.oid = ix.indexrelid
  WHERE i.relname = 'reservations_reservationNumber_key'
    AND i.relnamespace = 'public'::regnamespace;

  IF partial IS NULL THEN
    CREATE UNIQUE INDEX "reservations_reservationNumber_key" ON public.reservations ("reservationNumber");
  ELSIF partial THEN
    DROP INDEX IF EXISTS public."reservations_reservationNumber_key_full";
    CREATE UNIQUE INDEX "reservations_reservationNumber_key_full" ON public.reservations ("reservationNumber");
    DROP INDEX public."reservations_reservationNumber_key";
    ALTER INDEX public."reservations_reservationNumber_key_full" RENAME TO "reservations_reservationNumber_key";
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 3) Colunas de data
-- ---------------------------------------------------------------------------------------------
-- 3a) timestamptz(6) → timestamp(3) em UTC explícito (não depende do fuso da sessão). O DEFAULT
--     now() existente sobrevive ao ALTER TYPE e continua sendo lido como `now()`.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type = 'timestamp with time zone'
      AND (c.table_name, c.column_name) IN (
        ('ai_billing_config',       'rateUpdatedAt'),
        ('ai_billing_config',       'updatedAt'),
        ('ai_cost_reconciliations', 'createdAt'),
        ('ai_cost_reconciliations', 'updatedAt')
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamp(3) USING (%I AT TIME ZONE ''UTC'')',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

-- 3b) Garante o DEFAULT now() dos updatedAt que o schema agora declara (`@default(now()) @updatedAt`).
--     Em produção todos já têm; aqui só para qualquer outro ambiente ficar igual.
ALTER TABLE public.ai_billing_config         ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.ai_cost_reconciliations   ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.ai_model_defaults         ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.tenant_ai_model_overrides ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE public.review_channel_connectors ALTER COLUMN "updatedAt" SET DEFAULT now();
