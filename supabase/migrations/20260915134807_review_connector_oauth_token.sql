-- Campos de token OAuth (Meta/Facebook+Instagram) em review_channel_connectors — ver comentário no
-- model ReviewChannelConnector em packages/database/prisma/schema.prisma. O valor cifrado nunca é
-- gravado aqui pela migration, só a coluna é criada; a cifra acontece em runtime
-- (apps/web/src/lib/secretBox.ts, AES-256-GCM) antes de qualquer INSERT/UPDATE.
ALTER TABLE public.review_channel_connectors
  ADD COLUMN IF NOT EXISTS "oauthAccessTokenEnc" text,
  ADD COLUMN IF NOT EXISTS "oauthTokenExpiresAt" timestamp(3);
