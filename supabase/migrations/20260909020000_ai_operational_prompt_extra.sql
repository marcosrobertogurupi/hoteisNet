-- Painel Admin — Fase 5: prompt do Agente Operacional por assinante.
--
-- operationalSystemPromptExtra: instruções extras de estilo/personalidade aplicadas às mensagens
-- de alerta do agente operacional. Só o admin da plataforma edita. Complementa o systemPromptExtra
-- (que já existia, para o agente de atendimento).
--
-- Mudança aditiva. ai_agent_settings já tem RLS habilitado.

ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS "operationalSystemPromptExtra" text;
