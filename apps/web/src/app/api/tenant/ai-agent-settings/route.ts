import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AgentTonePreset, OperationalAutonomyMode } from "@prisma/client";
import { getSessionUser, requireAdmin } from "@/lib/auth";

const DEFAULTS = {
  enabled: false,
  autoConfirmReservations: false,
  allowAgentCancelReservation: false,
  agentDisplayName: null as string | null,
  agentAvatarUrl: null as string | null,
  tonePreset: "PROFISSIONAL" as AgentTonePreset,
  monitoringEnabled: false,
  alertPhone: null as string | null,
  operationalAutonomyMode: "ALERT_ONLY" as OperationalAutonomyMode,
};

// GET /api/tenant/ai-agent-settings — configuração do agente de IA que o ASSINANTE controla:
// liga/desliga, identidade (nome/foto) e tom de conversa dos agentes. O prompt cru de
// personalidade e o controle de cota/bloqueio são exclusivos do admin master (/api/admin/tenants) —
// nunca devolvidos nem aceitos aqui. Ver AIAgentSetting no schema e PLANO_AGENTE_IA.md.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const settings = await prisma.aIAgentSetting.findUnique({ where: { tenantId: session.tenantId } });

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            enabled: settings.enabled,
            autoConfirmReservations: settings.autoConfirmReservations,
            allowAgentCancelReservation: settings.allowAgentCancelReservation,
            agentDisplayName: settings.agentDisplayName,
            agentAvatarUrl: settings.agentAvatarUrl,
            tonePreset: settings.tonePreset,
            monitoringEnabled: settings.monitoringEnabled,
            alertPhone: settings.alertPhone,
            operationalAutonomyMode: settings.operationalAutonomyMode,
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

// PATCH /api/tenant/ai-agent-settings — cria/atualiza (upsert) as preferências do assinante.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const fields = await req.json();
    const resolvedTenantId = session!.tenantId!;

    const data: Record<string, any> = {};
    if (fields.enabled !== undefined) data.enabled = !!fields.enabled;
    if (fields.autoConfirmReservations !== undefined) data.autoConfirmReservations = !!fields.autoConfirmReservations;
    if (fields.allowAgentCancelReservation !== undefined) data.allowAgentCancelReservation = !!fields.allowAgentCancelReservation;
    if (fields.agentDisplayName !== undefined) data.agentDisplayName = fields.agentDisplayName || null;
    if (fields.agentAvatarUrl !== undefined) data.agentAvatarUrl = fields.agentAvatarUrl || null;
    if (fields.tonePreset !== undefined && ["FORMAL", "PROFISSIONAL", "DESCONTRAIDO", "DIRETO"].includes(fields.tonePreset)) {
      data.tonePreset = fields.tonePreset;
    }
    if (fields.monitoringEnabled !== undefined) data.monitoringEnabled = !!fields.monitoringEnabled;
    if (fields.alertPhone !== undefined) data.alertPhone = fields.alertPhone || null;
    if (fields.operationalAutonomyMode !== undefined && ["ALERT_ONLY", "AUTONOMOUS_LIMITED"].includes(fields.operationalAutonomyMode)) {
      data.operationalAutonomyMode = fields.operationalAutonomyMode;
    }

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
