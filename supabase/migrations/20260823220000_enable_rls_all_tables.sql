-- Habilita Row Level Security em todas as tabelas gerenciadas pelo Prisma (packages/database/prisma/schema.prisma).
--
-- Por que isso é necessário: a aplicação nunca usa o cliente Supabase anon para consultar estas
-- tabelas (toda a leitura/escrita passa por Prisma, autenticado via sessão própria no Next.js —
-- ver apps/web/src/lib/auth.ts). Mas a NEXT_PUBLIC_SUPABASE_ANON_KEY fica embutida no bundle do
-- frontend, e o PostgREST do Supabase expõe automaticamente uma API REST para qualquer tabela sem
-- RLS habilitado. Sem esta migration, qualquer pessoa de posse da anon key consegue consultar
-- /rest/v1/<tabela> diretamente e vazar dados de todos os tenants, ignorando completamente a
-- autenticação e o isolamento multi-tenant da aplicação.
--
-- Nenhuma policy é criada de propósito: com RLS habilitado e zero policies, o Postgres nega por
-- padrão todo acesso vindo dos papéis anon/authenticated do PostgREST. A conexão do Prisma
-- (DATABASE_URL) usa o papel dono das tabelas, que não é afetado por RLS — nenhuma query da
-- aplicação muda de comportamento.
--
-- Antes de aplicar em produção (supabase db push), confirme que DATABASE_URL não usa os papéis
-- anon/authenticated do Supabase — só então é seguro assumir que o Prisma continua íntegro.

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeepers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_occupancy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."FNRHRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_checkin_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_debit_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stay_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_product_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uazapi_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snrhos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WhatsappMessageSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_payments ENABLE ROW LEVEL SECURITY;
