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
    const { cpfQueryQuotaMonthly, cpfQueryEnabled, aiSystemPromptExtra, aiTokenQuotaOverride, aiBlocked, cnpj, city, state } = body;

    // Dados do Hotel restritos ao admin master — o assinante vê mas não edita na tela dele
    // (ver /api/tenant/settings). CNPJ = identidade comercial; cidade/UF ficam com a administração.
    const hotelData: Record<string, any> = {};
    if (cnpj !== undefined) {
      const digits = String(cnpj || "").replace(/\D/g, "");
      if (digits && digits.length !== 14) {
        return NextResponse.json({ success: false, error: "CNPJ deve ter 14 dígitos." }, { status: 400 });
      }
      hotelData.cnpj = digits || null;
    }
    if (city !== undefined) hotelData.city = (String(city || "").trim() || null);
    if (state !== undefined) hotelData.state = (String(state || "").trim().slice(0, 2).toUpperCase() || null);
    if (Object.keys(hotelData).length > 0) {
      await prisma.tenant.update({ where: { id }, data: hotelData });
    }

    if (cpfQueryQuotaMonthly !== undefined) {
      if (typeof cpfQueryQuotaMonthly !== "number" || cpfQueryQuotaMonthly < 0 || !Number.isInteger(cpfQueryQuotaMonthly)) {
        return NextResponse.json(
          { success: false, error: "cpfQueryQuotaMonthly deve ser um número inteiro maior ou igual a zero." },
          { status: 400 }
        );
      }
      await prisma.tenant.update({ where: { id }, data: { cpfQueryQuotaMonthly } });
    }

    // Liga/desliga o serviço de consulta de CPF para este assinante, independente da cota —
    // um assinante pode ter cota configurada e ainda assim estar sem o recurso no plano.
    if (cpfQueryEnabled !== undefined) {
      await prisma.tenant.update({ where: { id }, data: { cpfQueryEnabled: !!cpfQueryEnabled } });
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
        cpfQueryEnabled: true,
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
