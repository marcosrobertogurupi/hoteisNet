import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// PATCH /api/admin/tenants/[id]
// Ajusta a cota mensal de consultas de CPF (Hub do Desenvolvedor) de um assinante
// específico. Restrito a SUPER_ADMIN — o próprio assinante não configura sua cota.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Ação restrita ao SuperAdmin." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { cpfQueryQuotaMonthly, aiSystemPromptExtra, aiTokenQuotaOverride, aiBlocked } = body;

    if (cpfQueryQuotaMonthly !== undefined) {
      if (typeof cpfQueryQuotaMonthly !== "number" || cpfQueryQuotaMonthly < 0 || !Number.isInteger(cpfQueryQuotaMonthly)) {
        return NextResponse.json(
          { success: false, error: "cpfQueryQuotaMonthly deve ser um número inteiro maior ou igual a zero." },
          { status: 400 }
        );
      }
      await prisma.tenant.update({ where: { id }, data: { cpfQueryQuotaMonthly } });
    }

    // systemPromptExtra, tokenQuotaOverride e blocked são controles exclusivos do admin master —
    // nunca editáveis pela tela de Configurações do assinante (ver AIAgentSetting no schema).
    if (aiSystemPromptExtra !== undefined || aiTokenQuotaOverride !== undefined || aiBlocked !== undefined) {
      if (aiTokenQuotaOverride !== undefined && aiTokenQuotaOverride !== null) {
        if (typeof aiTokenQuotaOverride !== "number" || aiTokenQuotaOverride < 0 || !Number.isInteger(aiTokenQuotaOverride)) {
          return NextResponse.json(
            { success: false, error: "aiTokenQuotaOverride deve ser um número inteiro maior ou igual a zero, ou null." },
            { status: 400 }
          );
        }
      }
      const aiData: Record<string, any> = {};
      if (aiSystemPromptExtra !== undefined) aiData.systemPromptExtra = aiSystemPromptExtra || null;
      if (aiTokenQuotaOverride !== undefined) aiData.tokenQuotaOverride = aiTokenQuotaOverride;
      if (aiBlocked !== undefined) aiData.blocked = !!aiBlocked;

      await prisma.aIAgentSetting.upsert({
        where: { tenantId: id },
        create: { tenantId: id, ...aiData },
        update: aiData,
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        cpfQueryQuotaMonthly: true,
        cpfQueryUsed: true,
        aiAgentSettings: { select: { systemPromptExtra: true, tokenQuotaOverride: true, blocked: true } },
      },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, tenant });
  } catch (error: any) {
    console.error("[PATCH /api/admin/tenants/:id] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: "Erro ao atualizar assinante" }, { status: 500 });
  }
}
