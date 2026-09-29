-- Importação do legado WinDev (HFSQL): o hóspede pode ter vários telefones e e-mails
-- (TelefonesHospede.fic / EmailHospedeNet.fic). Guest.phone/email continuam sendo o principal.
-- RLS habilitado SEM policy (CLAUDE.md §11): negação total para anon/authenticated; o Prisma usa o
-- papel dono e não é afetado.

CREATE TABLE IF NOT EXISTS public.guest_phones (
  "id"              text PRIMARY KEY,
  "tenantId"        text NOT NULL REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "guestId"         text NOT NULL REFERENCES public.guests("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "number"          text NOT NULL,
  "description"     text,
  "isPrimary"       boolean NOT NULL DEFAULT false,
  "whatsappId"      text,
  "profilePhotoUrl" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "guest_phones_tenantId_guestId_idx" ON public.guest_phones ("tenantId", "guestId");
ALTER TABLE public.guest_phones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.guest_emails (
  "id"        text PRIMARY KEY,
  "tenantId"  text NOT NULL REFERENCES public.tenants("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "guestId"   text NOT NULL REFERENCES public.guests("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email"     text NOT NULL,
  "isPrimary" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "guest_emails_tenantId_guestId_idx" ON public.guest_emails ("tenantId", "guestId");
ALTER TABLE public.guest_emails ENABLE ROW LEVEL SECURITY;
