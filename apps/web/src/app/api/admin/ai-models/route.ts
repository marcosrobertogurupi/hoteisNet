import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { getModelCatalog, validateModelForFeature } from "@/lib/aiAgent/modelCatalog";
import { AI_FEATURE_LIST, isKnownAiFeature, featureNeedsFunctionCalling } from "@/lib/aiAgent/features";
import { AI_MODEL_FALLBACK } from "@/lib/aiAgent/modelResolver";
import { aiFeatureLabel } from "@/lib/aiFeatureLabels";

// GET /api/admin/ai-models — catálogo de modelos (models.list do Google + preço de AiModelPrice),
// a lista de recursos de IA e o default de modelo por recurso. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const [catalog, defaults, overrides] = await Promise.all([
    getModelCatalog(),
    prisma.aiModelDefault.findMany({ select: { feature: true, model: true } }),
    prisma.tenantAiModelOverride.findMany({ select: { tenantId: true, feature: true, model: true } }),
  ]);
  const defaultByFeature = new Map(defaults.map((d) => [d.feature, d.model]));

  // { [tenantId]: { [feature]: model } }
  const overridesByTenant: Record<string, Record<string, string>> = {};
  for (const o of overrides) {
    (overridesByTenant[o.tenantId] ??= {})[o.feature] = o.model;
  }

  const features = AI_FEATURE_LIST.map((key) => ({
    key,
    ...aiFeatureLabel(key),
    needsFunctionCalling: featureNeedsFunctionCalling(key),
    defaultModel: defaultByFeature.get(key) ?? AI_MODEL_FALLBACK,
    defaultIsExplicit: defaultByFeature.has(key),
  }));

  return NextResponse.json({
    success: true,
    catalog,
    features,
    overridesByTenant,
    fallbackModel: AI_MODEL_FALLBACK,
  });
}

// PATCH /api/admin/ai-models — define/limpa o modelo padrão da plataforma para um recurso.
// body: { feature, model }  — model vazio/null remove o default (volta ao fallback do código).
// Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

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
    await prisma.aiModelDefault.deleteMany({ where: { feature } });
    await logPlatformAction({
      req,
      session: session!,
      action: "AI_MODEL_DEFAULT_CLEAR",
      description: `Modelo padrão do recurso "${feature}" voltou ao padrão do sistema.`,
      entityType: "AiModelDefault",
      entityId: feature,
    });
    return NextResponse.json({ success: true, feature, model: null });
  }

  const validation = await validateModelForFeature(model, feature);
  if (validation) return NextResponse.json(validation.body, { status: validation.status });

  await prisma.aiModelDefault.upsert({
    where: { feature },
    create: { feature, model, updatedById: session!.userId },
    update: { model, updatedById: session!.userId },
  });
  await logPlatformAction({
    req,
    session: session!,
    action: "AI_MODEL_DEFAULT_SET",
    description: `Modelo padrão do recurso "${feature}" definido como ${model}.`,
    entityType: "AiModelDefault",
    entityId: feature,
    details: { feature, model },
  });

  return NextResponse.json({ success: true, feature, model });
}
