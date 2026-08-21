import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

const DEFAULTS = {
  environment: "HOMOLOGACAO",
  apiUsername: "",
  apiPassword: "",
  cpfSolicitante: "",
  enabled: false,
};

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/snrhos-settings?tenantId=... — devolve a configuração de transmissão ao SNRHos
// do assinante (ambiente, usuário/chave da API, CPF do responsável, habilitado).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));

    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const settings = await prisma.sNRHosSetting.findUnique({ where: { tenantId: resolvedTenantId } });

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            environment: settings.environment,
            apiUsername: settings.apiUsername,
            // A senha/chave nunca é devolvida ao cliente por completo — só um indicador de que já
            // foi configurada, para a UI mostrar "chave salva" sem reexibir o valor secreto.
            apiPasswordConfigured: !!settings.apiPassword,
            cpfSolicitante: settings.cpfSolicitante,
            enabled: settings.enabled,
          }
        : { ...DEFAULTS, apiPasswordConfigured: false },
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/snrhos-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar configurações do SNRHos." },
      { status: 500 }
    );
  }
}

// PATCH /api/tenant/snrhos-settings — cria/atualiza (upsert) as credenciais de transmissão ao
// SNRHos do assinante. apiPassword só é atualizado quando enviado (campo vazio não apaga a
// chave já salva), para a tela poder salvar outros campos sem exigir redigitar a chave.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, ...fields } = body;

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    if (fields.environment && !["HOMOLOGACAO", "PRODUCAO"].includes(fields.environment)) {
      return NextResponse.json({ success: false, error: "Ambiente inválido." }, { status: 400 });
    }

    const data: Record<string, any> = {};
    if (fields.environment !== undefined) data.environment = fields.environment;
    if (fields.apiUsername !== undefined) data.apiUsername = fields.apiUsername;
    if (fields.apiPassword) data.apiPassword = fields.apiPassword;
    if (fields.cpfSolicitante !== undefined) data.cpfSolicitante = fields.cpfSolicitante;
    if (fields.enabled !== undefined) data.enabled = !!fields.enabled;

    await prisma.sNRHosSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: { tenantId: resolvedTenantId, ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/snrhos-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao salvar configurações do SNRHos." },
      { status: 500 }
    );
  }
}
