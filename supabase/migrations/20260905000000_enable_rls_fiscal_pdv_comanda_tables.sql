-- Habilita Row Level Security nas tabelas criadas DEPOIS das migrations
-- 20260823220000_enable_rls_all_tables.sql e 20260826120000_enable_rls_knowledge_tables.sql,
-- que por isso ficaram sem RLS e foram sinalizadas como CRITICAL pelo Supabase Advisor
-- ("RLS Disabled in Public").
--
-- Mesmo motivo das migrations anteriores: a NEXT_PUBLIC_SUPABASE_ANON_KEY fica embutida no
-- bundle do frontend, e o PostgREST do Supabase expõe automaticamente /rest/v1/<tabela> para
-- qualquer tabela sem RLS. Sem esta migration, qualquer pessoa de posse da anon key consegue
-- ler E gravar diretamente nestas tabelas (config fiscal, certificado, CNPJ, numeração de
-- NFC-e, comandas, contagens de estoque), ignorando completamente a autenticação e o
-- isolamento multi-tenant da aplicação.
--
-- Nenhuma policy é criada de propósito: RLS habilitado + zero policies = negação total para os
-- papéis anon/authenticated do PostgREST. A conexão do Prisma (DATABASE_URL) usa o papel dono
-- das tabelas, que não é afetado por RLS — nenhuma query da aplicação muda de comportamento.

-- PDV Fiscal do Restaurante (NFC-e / NF-e)
ALTER TABLE public.fiscal_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_events ENABLE ROW LEVEL SECURITY;

-- Comandas do restaurante
ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comanda_debit_transfers ENABLE ROW LEVEL SECURITY;

-- Contagem de estoque (app mobile de código de barras) e cadastros
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;

-- Memórias de conversa do agente de IA (dados de hóspede por tenant)
ALTER TABLE public.conversation_memories ENABLE ROW LEVEL SECURITY;

-- Controle de versão publicada do app (sem dado de tenant, mas não deve ser gravável de fora)
ALTER TABLE public.app_release_control ENABLE ROW LEVEL SECURITY;
