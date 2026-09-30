-- Importação do legado WinDev (HFSQL) — cadastros de referência que ainda não existiam no SaaS.
--  * countries: países (Paises.fic — Pai_Nome/Pai_DDi). O legado não guarda o código ISO; ele é
--    preenchido na importação pelo nome do país (usado em Guest.nationality, formato ISO alpha-2).
--  * ncm_codes: tabela NCM (NCM.fic — NCM_Codigo/NCM_Descricao). Dado público de referência,
--    igual para todos os assinantes (como municipalities) — não contém dado de tenant.
--  * products.ncm / products.cest: Prod_NCM / Prod_CEST do legado.
-- RLS habilitado SEM policy nas tabelas novas (CLAUDE.md §11): negação total para anon/authenticated;
-- o Prisma usa o papel dono e não é afetado.

CREATE TABLE IF NOT EXISTS public.countries (
  "id"        text PRIMARY KEY,
  "name"      text NOT NULL,
  "isoCode"   text,
  "dialCode"  text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "countries_isoCode_key" ON public.countries ("isoCode");
CREATE INDEX IF NOT EXISTS "countries_name_idx" ON public.countries ("name");
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ncm_codes (
  "code"        text PRIMARY KEY,
  "description" text NOT NULL,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.ncm_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "ncm" text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "cest" text;
