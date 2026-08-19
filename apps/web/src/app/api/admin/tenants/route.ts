import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/admin/tenants
// Lista todos os assinantes do SaaS com a cota mensal de consultas de CPF (Hub do
// Desenvolvedor) que cada um tem contratada — usado no Painel SuperAdmin. Restrito
// a SUPER_ADMIN: cada assinante não deve ver nem configurar a cota de outro.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Ação restrita ao SuperAdmin." }, { status: 403 });
  }

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
        subscriptions: {
          where: { active: true },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { name: true } } },
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
        cpfQueryQuotaMonthly: t.cpfQueryQuotaMonthly,
        cpfQueryUsed: t.cpfQueryUsed,
        cpfQueryCycleStart: t.cpfQueryCycleStart,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/tenants] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao buscar assinantes" }, { status: 500 });
  }
}
