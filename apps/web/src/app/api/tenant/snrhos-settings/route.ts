import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

const DEFAULTS = {
  environment: "HOMOLOGACAO",
  apiUsername: "",
  apiPassword: "",
  cpfSolicitante: "",
  enabled: false,
};

// GET /api/tenant/snrhos-settings — devolve a configuração de transmissão ao SNRHos do tenant da
// sessão (ambiente, usuário/chave da API, CPF do responsável, habilitado). Só admin: expõe
// credenciais de uma API governamental.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const settings = await prisma.sNRHosSetting.findUnique({ where: { tenantId: session!.tenantId! } });

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
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId!;

    const fields = await req.json();

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
