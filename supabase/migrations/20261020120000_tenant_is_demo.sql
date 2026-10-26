-- Tenant de demonstração/teste nunca coleta reviews via Apify (scraping pago). Ver reviewsSync.ts.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS "isDemo" boolean NOT NULL DEFAULT false;

UPDATE public.tenants SET "isDemo" = true WHERE id IN ('tenant-hoteisnet-demo', 'TNT-01');
