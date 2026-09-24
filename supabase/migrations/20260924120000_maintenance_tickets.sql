-- Controle de manutenção de quartos (Fase 1 — OS com funil).
--
-- maintenance_tickets: OS de manutenção de um quarto (Entrada → Avaliando → Aguardando →
--   Resolvido / Cancelada). Enquanto aberta, o quarto fica em MAINTENANCE; só o colaborador
--   atribuído avança as etapas. Regras em apps/web/src/lib/maintenance.ts.
-- maintenance_ticket_events: linha do tempo da OS (quem fez o quê e quando).
-- maintenance_ticket_photos: fotos do problema — só o caminho no Storage (bucket privado
--   `maintenance-photos`), nunca a imagem.
-- maintenance_problem_types / maintenance_wait_reasons: listas cadastradas por hotel.
-- employees."maintenanceTech": marca o colaborador que atende manutenção.
--
-- Espelha packages/database/prisma/schema.prisma. Totalmente ADITIVA (tabelas novas + coluna com
-- default): pode ser aplicada antes do deploy do código sem afetar a versão em produção.
-- Tabelas novas com RLS habilitado e SEM policies (negação total anon/authenticated; o Prisma usa
-- o papel dono e não é afetado). Ver CLAUDE.md, Segurança §11.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MaintenanceStage" AS ENUM ('OPEN', 'EVALUATING', 'WAITING', 'RESOLVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceNotifyStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceEventType" AS ENUM ('OPENED', 'STAGE_CHANGED', 'REASSIGNED', 'FORECAST_CHANGED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MaintenanceActorType" AS ENUM ('USER', 'EMPLOYEE', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- AlterTable (aditiva — employees já tem RLS)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "maintenanceTech" boolean NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS public.maintenance_problem_types (
  id          text PRIMARY KEY,
  "tenantId"  text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_problem_types_tenantId_name_key"
  ON public.maintenance_problem_types ("tenantId", name);

CREATE TABLE IF NOT EXISTS public.maintenance_wait_reasons (
  id          text PRIMARY KEY,
  "tenantId"  text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_wait_reasons_tenantId_name_key"
  ON public.maintenance_wait_reasons ("tenantId", name);

CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id                   text PRIMARY KEY,
  "tenantId"           text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  number               integer NOT NULL,
  "roomId"             text NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "problemTypeId"      text NOT NULL REFERENCES public.maintenance_problem_types(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  description          text NOT NULL,
  stage                "MaintenanceStage" NOT NULL DEFAULT 'OPEN',
  "assignedEmployeeId" text NOT NULL REFERENCES public.employees(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  "waitReasonId"       text REFERENCES public.maintenance_wait_reasons(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  "expectedReleaseAt"  timestamp(3),
  "previousRoomStatus" "RoomStatus" NOT NULL,
  "openedAt"           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openedByUserId"     text,
  "openedByName"       text NOT NULL,
  "resolvedAt"         timestamp(3),
  "resolutionNotes"    text,
  "downtimeMinutes"    integer,
  "cancelledAt"        timestamp(3),
  "cancelledByUserId"  text,
  "cancelledByName"    text,
  "cancelReason"       text,
  "notifyStatus"       "MaintenanceNotifyStatus" NOT NULL DEFAULT 'PENDING',
  "notifyAttempts"     integer NOT NULL DEFAULT 0,
  "notifiedAt"         timestamp(3),
  "createdAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          timestamp(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "maintenance_tickets_tenantId_number_key"
  ON public.maintenance_tickets ("tenantId", number);
CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenantId_stage_idx"
  ON public.maintenance_tickets ("tenantId", stage);
CREATE INDEX IF NOT EXISTS "maintenance_tickets_roomId_stage_idx"
  ON public.maintenance_tickets ("roomId", stage);
CREATE INDEX IF NOT EXISTS "maintenance_tickets_assignedEmployeeId_stage_idx"
  ON public.maintenance_tickets ("assignedEmployeeId", stage);

CREATE TABLE IF NOT EXISTS public.maintenance_ticket_events (
  id             text PRIMARY KEY,
  "tenantId"     text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "ticketId"     text NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  type           "MaintenanceEventType" NOT NULL,
  "fromStage"    "MaintenanceStage",
  "toStage"      "MaintenanceStage",
  "waitReasonId" text REFERENCES public.maintenance_wait_reasons(id) ON DELETE NO ACTION ON UPDATE CASCADE,
  note           text,
  "actorType"    "MaintenanceActorType" NOT NULL,
  "actorId"      text,
  "actorName"    text NOT NULL,
  "createdAt"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "maintenance_ticket_events_ticketId_createdAt_idx"
  ON public.maintenance_ticket_events ("ticketId", "createdAt");

CREATE TABLE IF NOT EXISTS public.maintenance_ticket_photos (
  id            text PRIMARY KEY,
  "tenantId"    text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "ticketId"    text NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "storagePath" text NOT NULL,
  stage         "MaintenanceStage" NOT NULL,
  "actorType"   "MaintenanceActorType" NOT NULL,
  "actorId"     text,
  "actorName"   text NOT NULL,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "maintenance_ticket_photos_ticketId_idx"
  ON public.maintenance_ticket_photos ("ticketId");

-- Row Level Security (negação total para anon/authenticated — ver cabeçalho)
ALTER TABLE public.maintenance_problem_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_wait_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_ticket_photos ENABLE ROW LEVEL SECURITY;
