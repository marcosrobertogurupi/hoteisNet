-- Painel Admin — Fase 4: métrica de egress (volume de dados) por assinante.
--
-- tenant_egress_daily: soma dos bytes de resultado de leitura do Prisma atribuídos a cada tenant,
-- por dia. Instrumentado na extensão do cliente Prisma (apps/web/src/lib/prisma.ts). Nunca
-- exposto ao assinante. Ver CLAUDE.md > Implementações futuras planejadas.
--
-- Tabela nova → RLS habilitado sem policies (negação total anon/authenticated). CLAUDE.md §11.

CREATE TABLE IF NOT EXISTS public.tenant_egress_daily (
  id              text PRIMARY KEY,
  "tenantId"      text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day             date NOT NULL,
  "responseBytes" bigint NOT NULL DEFAULT 0,
  "queryCount"    integer NOT NULL DEFAULT 0,
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_egress_daily_tenant_day_key
  ON public.tenant_egress_daily ("tenantId", day);
CREATE INDEX IF NOT EXISTS tenant_egress_daily_day_idx ON public.tenant_egress_daily (day);

ALTER TABLE public.tenant_egress_daily ENABLE ROW LEVEL SECURITY;
