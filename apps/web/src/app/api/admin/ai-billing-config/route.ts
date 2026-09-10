import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { getAiBillingConfig } from "@/lib/aiAgent/billing";

// GET /api/admin/ai-billing-config — câmbio USD→BRL e margem aplicados ao consumo de IA revendido.
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  return NextResponse.json({ success: true, config: await getAiBillingConfig() });
}

// PATCH /api/admin/ai-billing-config — edita câmbio e/ou margem. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const data: Record<string, any> = {};

  if (body.usdToBrlRate !== undefined) {
    const rate = Number(body.usdToBrlRate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      return NextResponse.json({ success: false, error: "Câmbio deve ser um número entre 0 e 100." }, { status: 400 });
    }
    data.usdToBrlRate = Math.round(rate * 10000) / 10000;
    data.rateUpdatedAt = new Date();
  }

  if (body.markupPct !== undefined) {
    const pct = Number(body.markupPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100000) {
      return NextResponse.json({ success: false, error: "Margem deve ser um inteiro ≥ 0 (%)." }, { status: 400 });
    }
    data.markupPct = pct;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, error: "Nada para atualizar." }, { status: 400 });
  }

  data.updatedByName = session!.name;

  await prisma.aiBillingConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  await logPlatformAction({
    req,
    session: session!,
    action: "AI_BILLING_CONFIG_UPDATE",
    description: `Faturamento de IA: ${Object.keys(data).filter((k) => k !== "updatedByName").join(", ")}`,
    entityType: "AiBillingConfig",
    entityId: "singleton",
    details: data,
  });

  return NextResponse.json({ success: true, config: await getAiBillingConfig() });
}
