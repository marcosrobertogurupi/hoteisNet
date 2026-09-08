-- Fila de espera para reservas/hospedagem (Fase 1 — núcleo).
--
-- waitlist_entries: interesse do hóspede quando não há disponibilidade para um período/categoria,
--   registrado manualmente pela recepção ou pelo agente de IA (source). O worker
--   (apps/worker/src/waitlistAgent.ts) reavalia a fila e avisa o primeiro (createdAt asc) quando
--   abre uma vaga da MESMA categoria num período compatível. A reserva tem prioridade absoluta:
--   a fila só recebe um quarto genuinamente livre (ver apps/web/src/lib/waitlistMatch.ts).
-- ai_agent_settings.waitlistAutoOfferEnabled: false = só a recepção é avisada; true = o agente
--   avisa o hóspede e registra a reserva sozinho.
--
-- Tabela nova entra com RLS habilitado e SEM policies (negação total anon/authenticated; o Prisma
-- usa o papel dono e não é afetado). Ver CLAUDE.md, Segurança §11.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaitlistSource" AS ENUM ('MANUAL', 'AI_AGENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable (aditiva — ai_agent_settings já tem RLS)
ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS "waitlistAutoOfferEnabled" boolean NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id                       text PRIMARY KEY,
  "tenantId"               text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "guestName"              text NOT NULL,
  "guestPhone"             text,
  "guestCpf"               text,
  "guestId"                text,
  "roomCategoryId"         text NOT NULL REFERENCES public.room_categories(id) ON UPDATE CASCADE,
  "roomCategoryName"       text NOT NULL,
  "checkInDate"            timestamp(3) NOT NULL,
  "checkOutDate"           timestamp(3) NOT NULL,
  adults                   integer NOT NULL DEFAULT 1,
  children                 integer NOT NULL DEFAULT 0,
  notes                    text,
  status                   "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  source                   "WaitlistSource" NOT NULL DEFAULT 'MANUAL',
  "operatorId"             text,
  "operatorName"           text,
  "notifiedAt"             timestamp(3),
  "notifyExpiresAt"        timestamp(3),
  "notifiedRoomId"         text,
  "notifyAttempts"         integer NOT NULL DEFAULT 0,
  "agentAcceptRequestedAt" timestamp(3),
  "convertedReservationId" text,
  "closedReason"           text,
  "createdAt"              timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              timestamp(3) NOT NULL
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "waitlist_entries_tenantId_status_idx" ON public.waitlist_entries ("tenantId", status);

-- Row Level Security (negação total para anon/authenticated — ver cabeçalho)
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
