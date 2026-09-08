import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requirePlatformRole } from "@/lib/auth";

// GET /api/admin/tenants
// Lista todos os assinantes do SaaS com a cota mensal de consultas de CPF (Hub do
// Desenvolvedor) e a config de IA de cada um — usado no Painel Admin. Leitura: qualquer
// papel de plataforma (inclusive PLATFORM_SUPPORT, que só visualiza).
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        tradeName: true,
        city: true,
        state: true,
        status: true,
        cpfQueryQuotaMonthly: true,
        cpfQueryUsed: true,
        cpfQueryCycleStart: true,
        cpfQueryEnabled: true,
        subscriptions: {
          where: { active: true },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { name: true, aiTokenQuota: true } } },
        },
        aiAgentSettings: {
          select: { systemPromptExtra: true, tokenQuotaOverride: true, blocked: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        tradeName: t.tradeName,
        city: t.city,
        state: t.state,
        status: t.status,
        planName: t.subscriptions[0]?.plan?.name || null,
        planAiTokenQuota: t.subscriptions[0]?.plan?.aiTokenQuota ?? null,
        cpfQueryQuotaMonthly: t.cpfQueryQuotaMonthly,
        cpfQueryUsed: t.cpfQueryUsed,
        cpfQueryCycleStart: t.cpfQueryCycleStart,
        cpfQueryEnabled: t.cpfQueryEnabled,
        aiSystemPromptExtra: t.aiAgentSettings?.systemPromptExtra || "",
        aiTokenQuotaOverride: t.aiAgentSettings?.tokenQuotaOverride ?? null,
        aiBlocked: t.aiAgentSettings?.blocked || false,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/tenants] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao buscar assinantes" }, { status: 500 });
  }
}
