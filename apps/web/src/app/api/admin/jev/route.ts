import { NextRequest, NextResponse } from "next/server";
import type { JevMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { aiFeatureLabel } from "@/lib/aiFeatureLabels";
import { JEV_FEATURE_DEFS, JEV_FEATURE_LIST, isKnownJevFeature } from "@/lib/jev/features";
import { JEV_DEFAULT_MODEL } from "@/lib/jev/client";

const STATS_DAYS = 7;
const MODES: JevMode[] = ["OFF", "SHADOW", "ACTIVE"];

// GET /api/admin/jev — modo de cada recurso do Jev + estatísticas agregadas dos últimos 7 dias
// (decisões × desfecho observado, latência média, custo). Só agregados — nenhum dado de hóspede.
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const [settings, byDecision, totals] = await Promise.all([
    prisma.jevFeatureSetting.findMany({ select: { feature: true, mode: true, model: true } }),
    prisma.jevDecisionLog.groupBy({
      by: ["feature", "decision", "observedOutcome"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.jevDecisionLog.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since } },
      _count: { _all: true, error: true },
      _avg: { durationMs: true },
      _sum: { costUsd: true },
    }),
  ]);
  const settingByFeature = new Map(settings.map((s) => [s.feature, s]));
  const totalsByFeature = new Map(totals.map((t) => [t.feature, t]));

  const features = JEV_FEATURE_LIST.map((key) => {
    const s = settingByFeature.get(key);
    const t = totalsByFeature.get(key);
    return {
      key,
      ...aiFeatureLabel(key),
      mode: s?.mode ?? "OFF",
      model: s?.model ?? JEV_DEFAULT_MODEL,
      activeAvailable: JEV_FEATURE_DEFS[key].activeAvailable,
      stats: {
        decisions: t?._count._all ?? 0,
        errors: t?._count.error ?? 0,
        avgDurationMs: t?._avg.durationMs != null ? Math.round(t._avg.durationMs) : null,
        costUsd: Number(t?._sum.costUsd ?? 0),
        breakdown: byDecision
          .filter((b) => b.feature === key)
          .map((b) => ({ decision: b.decision, observedOutcome: b.observedOutcome, count: b._count._all })),
      },
    };
  });

  return NextResponse.json({
    success: true,
    keyConfigured: !!process.env.OPENROUTER_API_KEY,
    statsDays: STATS_DAYS,
    features,
  });
}

// PATCH /api/admin/jev — define o modo de um recurso. body: { feature, mode: "OFF"|"SHADOW"|"ACTIVE" }.
// Edição: PLATFORM_ADMIN / SUPER_ADMIN. ACTIVE só onde o recurso já sabe agir.
export async function PATCH(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const feature = String(body.feature || "");
  if (!isKnownJevFeature(feature)) {
    return NextResponse.json({ success: false, error: "Recurso desconhecido." }, { status: 400 });
  }
  const mode = String(body.mode || "") as JevMode;
  if (!MODES.includes(mode)) {
    return NextResponse.json({ success: false, error: "Modo inválido." }, { status: 400 });
  }
  if (mode === "ACTIVE" && !JEV_FEATURE_DEFS[feature].activeAvailable) {
    return NextResponse.json(
      { success: false, error: "Este recurso ainda não pode agir sozinho — use o modo de observação." },
      { status: 400 }
    );
  }

  await prisma.jevFeatureSetting.upsert({
    where: { feature },
    create: { feature, mode, updatedById: session!.userId },
    update: { mode, updatedById: session!.userId },
  });
  await logPlatformAction({
    req,
    session: session!,
    action: "JEV_FEATURE_MODE_SET",
    description: `Decisões rápidas (Jev) — recurso "${feature}" definido como ${mode}.`,
    entityType: "JevFeatureSetting",
    entityId: feature,
    details: { feature, mode },
  });

  return NextResponse.json({ success: true, feature, mode });
}
