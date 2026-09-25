-- Telemetria de IA — duração de cada chamada ao provedor (ms, ida e volta medida no nosso lado).
-- Aditiva e nullable: registros antigos ficam null e o código anterior continua gravando sem ela.
-- Base para medir latência por recurso/modelo antes de trocar partes da IA por modelos de decisão
-- mais rápidos (Jev/TypeSafe via OpenRouter). Não é tabela nova — o RLS de ai_usage_logs já existe.
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS "durationMs" integer;
