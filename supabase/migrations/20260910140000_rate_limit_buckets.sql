-- Contador de força-bruta por IP, compartilhado entre as instâncias serverless
--
-- Enquanto a contagem era um Map em memória (apps/web/src/lib/rateLimit.ts), na Vercel cada
-- instância tinha a própria: "5 tentativas por minuto" virava 5 × número de instâncias e caía a
-- zero a cada cold start — exatamente o cenário de um atacante distribuindo tentativas.
--
-- Sem tenantId de propósito: a chave é derivada do IP e do endpoint, e o contador precisa valer
-- ANTES de existir qualquer sessão (é o que protege o próprio login).

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  "key"     text PRIMARY KEY,
  "count"   integer NOT NULL DEFAULT 0,
  "resetAt" timestamp(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "rate_limit_buckets_resetAt_idx"
  ON public.rate_limit_buckets ("resetAt");

-- RLS ligado e ZERO policies = negação total para anon/authenticated (a NEXT_PUBLIC_SUPABASE_ANON_KEY
-- vai embutida no bundle do frontend e o PostgREST expõe automaticamente qualquer tabela sem RLS).
-- O Prisma usa o papel dono da tabela e não é afetado. Ver CLAUDE.md, Segurança §11.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
