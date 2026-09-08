-- Painel Admin — Fase 5c: base de conhecimento global do produto + agente de IA de suporte.
--
-- platform_support_docs: artigos globais (como usar o Hoteis.Net) que o agente de suporte ao
-- assinante lê como contexto. Não é por tenant.
--
-- Tabela nova → RLS habilitado sem policies (negação total anon/authenticated). CLAUDE.md §11.

CREATE TABLE IF NOT EXISTS public.platform_support_docs (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'Geral',
  content     text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  source      text NOT NULL DEFAULT 'MANUAL',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_support_docs_active_idx ON public.platform_support_docs (active);

ALTER TABLE public.platform_support_docs ENABLE ROW LEVEL SECURITY;
