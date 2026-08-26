-- Habilita Row Level Security nas tabelas novas da Base de Conhecimento do Hotel, pelo mesmo motivo
-- de 20260823220000_enable_rls_all_tables.sql: toda leitura/escrita da aplicação passa pelo Prisma
-- (papel dono das tabelas, não afetado por RLS), mas o PostgREST do Supabase exporia automaticamente
-- /rest/v1/<tabela> para os papéis anon/authenticated se RLS não estivesse habilitado — vazando
-- dados de todos os tenants para quem tivesse a NEXT_PUBLIC_SUPABASE_ANON_KEY (embutida no bundle).
--
-- Sem nenhuma policy de propósito: RLS habilitado + zero policies = negação total para anon/authenticated.

ALTER TABLE public.hotel_knowledge_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_revisions ENABLE ROW LEVEL SECURITY;
