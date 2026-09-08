import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requirePlatformRole } from "@/lib/auth";

// GET /api/admin/plans — catálogo de planos do SaaS, para o seletor de plano no cadastro de
// assinante. Leitura: qualquer papel de plataforma. O CRUD completo de planos é a Fase 2.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { searchParams } = new URL(req.url);
  const onlyActive = searchParams.get("active") !== "0";

  const plans = await prisma.saaSPlan.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: { priceMonthly: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      priceMonthly: true,
      maxRooms: true,
      maxUsers: true,
      aiTokenQuota: true,
      active: true,
      _count: { select: { subscriptions: true } },
    },
  });

  return NextResponse.json({ success: true, plans });
}
