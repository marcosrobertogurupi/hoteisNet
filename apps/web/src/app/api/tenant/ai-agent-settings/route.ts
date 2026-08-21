import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

const DEFAULTS = {
  enabled: false,
  autoConfirmReservations: false,
  systemPromptExtra: null as string | null,
  monitoringEnabled: false,
  alertPhone: null as string | null,
};

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/ai-agent-settings?tenantId=... — configuração do agente de IA do assinante.
// Só comportamento/feature toggles: chave do AI Gateway, modelo e cota de tokens são globais,
// nunca expostos aqui (ver AIAgentSetting no schema).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const settings = await prisma.aIAgentSetting.findUnique({ where: { tenantId: resolvedTenantId } });

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            enabled: settings.enabled,
            autoConfirmReservations: settings.autoConfirmReservations,
            systemPromptExtra: settings.systemPromptExtra,
            monitoringEnabled: settings.monitoringEnabled,
            alertPhone: settings.alertPhone,
          }
        : DEFAULTS,
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/ai-agent-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar configurações do agente de IA." },
      { status: 500 }
    );
  }
}

// PATCH /api/tenant/ai-agent-settings — cria/atualiza (upsert) as preferências do agente de IA.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, ...fields } = body;

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const data: Record<string, any> = {};
    if (fields.enabled !== undefined) data.enabled = !!fields.enabled;
    if (fields.autoConfirmReservations !== undefined) data.autoConfirmReservations = !!fields.autoConfirmReservations;
    if (fields.systemPromptExtra !== undefined) data.systemPromptExtra = fields.systemPromptExtra || null;
    if (fields.monitoringEnabled !== undefined) data.monitoringEnabled = !!fields.monitoringEnabled;
    if (fields.alertPhone !== undefined) data.alertPhone = fields.alertPhone || null;

    await prisma.aIAgentSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: { tenantId: resolvedTenantId, ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/ai-agent-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao salvar configurações do agente de IA." },
      { status: 500 }
    );
  }
}
