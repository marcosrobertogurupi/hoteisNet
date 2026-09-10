import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { validateModelForFeature } from "@/lib/aiAgent/modelCatalog";
import { isKnownAiFeature } from "@/lib/aiAgent/features";

// GET /api/admin/tenants/[id]/ai-models — overrides de modelo de IA por recurso deste assinante
// (só os que têm override; recurso sem linha = usa o default da plataforma). Leitura: qualquer papel.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const overrides = await prisma.tenantAiModelOverride.findMany({
    where: { tenantId: id },
    select: { feature: true, model: true },
  });
  return NextResponse.json({ success: true, overrides });
}

// PATCH /api/admin/tenants/[id]/ai-models — define/limpa o override de modelo de um recurso para
// este assinante. body: { feature, model } — model vazio/null remove o override (volta ao default).
// Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const feature = String(body.feature || "");
  if (!isKnownAiFeature(feature)) {
    return NextResponse.json({ success: false, error: "Recurso de IA desconhecido." }, { status: 400 });
  }
  const model = String(body.model || "").trim();

  if (!model) {
    await prisma.tenantAiModelOverride.deleteMany({ where: { tenantId: id, feature } });
    await logPlatformAction({
      req,
      session: session!,
      action: "AI_MODEL_OVERRIDE_CLEAR",
      description: `${tenant.name}: recurso "${feature}" voltou ao modelo padrão da plataforma.`,
      targetTenantId: id,
      entityType: "TenantAiModelOverride",
      entityId: `${id}:${feature}`,
    });
    return NextResponse.json({ success: true, feature, model: null });
  }

  const validation = await validateModelForFeature(model, feature);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });

  await prisma.tenantAiModelOverride.upsert({
    where: { tenantId_feature: { tenantId: id, feature } },
    create: { tenantId: id, feature, model },
    update: { model },
  });
  await logPlatformAction({
    req,
    session: session!,
    action: "AI_MODEL_OVERRIDE_SET",
    description: `${tenant.name}: recurso "${feature}" fixado no modelo ${model}.`,
    targetTenantId: id,
    entityType: "TenantAiModelOverride",
    entityId: `${id}:${feature}`,
    details: { feature, model },
  });

  return NextResponse.json({ success: true, feature, model });
}
