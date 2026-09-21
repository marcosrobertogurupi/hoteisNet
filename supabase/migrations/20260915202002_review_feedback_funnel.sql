-- Funil de satisfação pós-checkout — ver comentário no model ReviewFeedbackRequest em
-- packages/database/prisma/schema.prisma.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "reviewFeedbackEnabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.review_feedback_requests (
  "id"              text PRIMARY KEY,
  "tenantId"        text NOT NULL,
  "stayCheckinId"   text NOT NULL,
  "token"           text NOT NULL UNIQUE,
  "status"          text NOT NULL DEFAULT 'PENDING',
  "satisfaction"    integer,
  "outcome"         text,
  "redirectChannel" "ReviewChannel",
  "expiresAt"       timestamp(3) NOT NULL,
  "sentAt"          timestamp(3),
  "openedAt"        timestamp(3),
  "completedAt"     timestamp(3),
  "createdAt"       timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "review_feedback_requests_stayCheckinId_idx"
  ON public.review_feedback_requests ("stayCheckinId");

-- RLS ligado e ZERO policies = negação total para anon/authenticated (a NEXT_PUBLIC_SUPABASE_ANON_KEY
-- vai embutida no bundle do frontend e o PostgREST expõe automaticamente qualquer tabela sem RLS).
-- O Prisma usa o papel dono da tabela e não é afetado. Ver CLAUDE.md, Segurança §11.
ALTER TABLE public.review_feedback_requests ENABLE ROW LEVEL SECURITY;
