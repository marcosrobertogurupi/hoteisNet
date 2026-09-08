import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";

// GET /api/admin/integrations — situação das integrações externas do SaaS. SÓ diz se está
// configurada (variável de ambiente presente) — NUNCA devolve o valor de nenhuma chave
// (CLAUDE.md §6). Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const has = (...vars: string[]) => vars.every((v) => !!process.env[v]?.trim());

  const integrations = [
    {
      key: "google_ai",
      name: "Google Generative AI (agentes de IA)",
      configured: has("GOOGLE_GENERATIVE_AI_API_KEY"),
      detail: "Chave usada pelos agentes de atendimento, operacional e de suporte.",
      env: ["GOOGLE_GENERATIVE_AI_API_KEY"],
    },
    {
      key: "ai_gateway",
      name: "Vercel AI Gateway",
      configured: has("AI_GATEWAY_API_KEY"),
      detail: "Disponível, mas os agentes usam o provider direto do Google (o Gateway exige cartão na Vercel).",
      env: ["AI_GATEWAY_API_KEY"],
    },
    {
      key: "asaas",
      name: "Asaas (cobrança dos assinantes)",
      configured: has("ASAAS_API_KEY"),
      detail: !has("ASAAS_API_KEY")
        ? "Sem a chave, o SaaS opera em cobrança manual (nada é gerado no Asaas)."
        : has("ASAAS_WEBHOOK_SECRET")
          ? "API e webhook configurados."
          : "API configurada, mas falta ASAAS_WEBHOOK_SECRET — sem ele os pagamentos não atualizam o acesso.",
      env: ["ASAAS_API_KEY", "ASAAS_BASE_URL", "ASAAS_WEBHOOK_SECRET"],
    },
    {
      key: "hub_dev",
      name: "Hub do Desenvolvedor (consulta CPF/CNPJ)",
      configured: has("HUB_DESENVOLVEDOR_TOKEN", "HUB_DESENVOLVEDOR_CONTRACT"),
      detail: "Token e contrato compartilhados para a consulta de CPF no cadastro de hóspede.",
      env: ["HUB_DESENVOLVEDOR_TOKEN", "HUB_DESENVOLVEDOR_CONTRACT"],
    },
    {
      key: "platform_whatsapp",
      name: "WhatsApp da plataforma (uazapi)",
      configured: has("UAZAPI_FALLBACK_SERVER_URL", "UAZAPI_FALLBACK_INSTANCE_TOKEN"),
      detail: "Instância usada para alertas do worker e para o painel Mensagens.",
      env: ["UAZAPI_FALLBACK_SERVER_URL", "UAZAPI_FALLBACK_INSTANCE_TOKEN"],
    },
    {
      key: "supabase",
      name: "Supabase (banco / storage)",
      configured: has("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"),
      detail: "Banco Postgres e chaves do projeto.",
      env: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"],
    },
    {
      key: "session",
      name: "Sessão (JWT)",
      configured: has("SESSION_SECRET"),
      detail: "Segredo de assinatura dos cookies de sessão (app e painel).",
      env: ["SESSION_SECRET"],
    },
  ];

  return NextResponse.json({ success: true, integrations });
}
