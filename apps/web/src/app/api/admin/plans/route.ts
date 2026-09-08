import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

// Normaliza um valor de preço vindo do body: "" / null / undefined → null; senão número ≥ 0.
function parsePrice(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.round(n * 100) / 100;
}
function parseInt0(v: unknown): number | "invalid" {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

const planSelect = {
  id: true,
  name: true,
  description: true,
  priceMonthly: true,
  priceSemiannual: true,
  priceAnnual: true,
  maxRooms: true,
  maxUsers: true,
  aiTokenQuota: true,
  features: true,
  trialDays: true,
  active: true,
  createdAt: true,
  _count: { select: { subscriptions: true } },
} as const;

// GET /api/admin/plans — catálogo de planos do SaaS. Leitura: qualquer papel de plataforma.
// ?active=0 inclui os inativos (default só ativos, usado pelo seletor no cadastro de assinante).
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const includeInactive = new URL(req.url).searchParams.get("active") === "0";
  const plans = await prisma.saaSPlan.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { priceMonthly: "asc" },
    select: planSelect,
  });
  return NextResponse.json({ success: true, plans });
}

// POST /api/admin/plans — cria um plano. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ success: false, error: "Nome do plano é obrigatório." }, { status: 400 });

  const priceMonthly = parsePrice(body.priceMonthly);
  if (priceMonthly === "invalid" || priceMonthly === null) {
    return NextResponse.json({ success: false, error: "Preço mensal é obrigatório e deve ser um número ≥ 0." }, { status: 400 });
  }
  const priceSemiannual = parsePrice(body.priceSemiannual);
  const priceAnnual = parsePrice(body.priceAnnual);
  if (priceSemiannual === "invalid" || priceAnnual === "invalid") {
    return NextResponse.json({ success: false, error: "Preço semestral/anual inválido." }, { status: 400 });
  }
  const maxRooms = parseInt0(body.maxRooms);
  const maxUsers = parseInt0(body.maxUsers);
  const aiTokenQuota = parseInt0(body.aiTokenQuota ?? 50000);
  const trialDays = parseInt0(body.trialDays ?? 0);
  if (maxRooms === "invalid" || maxUsers === "invalid" || aiTokenQuota === "invalid" || trialDays === "invalid") {
    return NextResponse.json({ success: false, error: "Limites e dias de trial devem ser inteiros ≥ 0." }, { status: 400 });
  }

  const features = Array.isArray(body.features)
    ? body.features.map((f: unknown) => String(f).trim()).filter(Boolean).slice(0, 30)
    : [];

  const dup = await prisma.saaSPlan.findUnique({ where: { name }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: "Já existe um plano com este nome." }, { status: 409 });

  const plan = await prisma.saaSPlan.create({
    data: {
      name,
      description: String(body.description || "").trim() || null,
      priceMonthly,
      priceSemiannual,
      priceAnnual,
      maxRooms,
      maxUsers,
      aiTokenQuota,
      trialDays,
      features,
      active: body.active === undefined ? true : !!body.active,
    },
    select: planSelect,
  });

  await logPlatformAction({
    req,
    session: session!,
    action: "PLAN_CREATE",
    description: `Plano criado: ${plan.name}`,
    entityType: "SaaSPlan",
    entityId: plan.id,
  });

  return NextResponse.json({ success: true, plan });
}
