import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const plan = await prisma.saaSPlan.findUnique({ where: { id }, select: planSelect });
  if (!plan) return NextResponse.json({ success: false, error: "Plano não encontrado." }, { status: 404 });
  return NextResponse.json({ success: true, plan });
}

// PATCH /api/admin/plans/[id] — edita um plano. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ success: false, error: "Nome não pode ficar vazio." }, { status: 400 });
    const dup = await prisma.saaSPlan.findFirst({ where: { name, id: { not: id } }, select: { id: true } });
    if (dup) return NextResponse.json({ success: false, error: "Já existe outro plano com este nome." }, { status: 409 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = String(body.description || "").trim() || null;

  for (const [key, raw] of [
    ["priceMonthly", body.priceMonthly],
    ["priceSemiannual", body.priceSemiannual],
    ["priceAnnual", body.priceAnnual],
  ] as const) {
    if (raw === undefined) continue;
    const p = parsePrice(raw);
    if (p === "invalid") return NextResponse.json({ success: false, error: `Valor inválido em ${key}.` }, { status: 400 });
    if (key === "priceMonthly" && p === null) {
      return NextResponse.json({ success: false, error: "Preço mensal não pode ficar vazio." }, { status: 400 });
    }
    data[key] = p;
  }

  for (const key of ["maxRooms", "maxUsers", "aiTokenQuota", "trialDays"] as const) {
    if (body[key] === undefined) continue;
    const n = parseInt0(body[key]);
    if (n === "invalid") return NextResponse.json({ success: false, error: `${key} deve ser inteiro ≥ 0.` }, { status: 400 });
    data[key] = n;
  }

  if (body.features !== undefined) {
    data.features = Array.isArray(body.features)
      ? body.features.map((f: unknown) => String(f).trim()).filter(Boolean).slice(0, 30)
      : [];
  }
  if (body.active !== undefined) data.active = !!body.active;

  try {
    const plan = await prisma.saaSPlan.update({ where: { id }, data, select: planSelect });
    await logPlatformAction({
      req,
      session: session!,
      action: "PLAN_UPDATE",
      description: `Plano ${plan.name}: ${Object.keys(data).join(", ") || "—"}`,
      entityType: "SaaSPlan",
      entityId: id,
      details: data,
    });
    return NextResponse.json({ success: true, plan });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ success: false, error: "Plano não encontrado." }, { status: 404 });
    console.error("[PATCH /api/admin/plans/:id] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao atualizar o plano." }, { status: 500 });
  }
}

// DELETE /api/admin/plans/[id] — só quando nenhum assinante usa o plano. Do contrário, oriente a
// desativar (active:false) para preservar o histórico das assinaturas.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const plan = await prisma.saaSPlan.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { subscriptions: true } } },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plano não encontrado." }, { status: 404 });
  if (plan._count.subscriptions > 0) {
    return NextResponse.json(
      { success: false, error: "Este plano tem assinantes vinculados. Desative-o em vez de excluir." },
      { status: 409 }
    );
  }

  await prisma.saaSPlan.delete({ where: { id } });
  await logPlatformAction({
    req,
    session: session!,
    action: "PLAN_DELETE",
    description: `Plano excluído: ${plan.name}`,
    entityType: "SaaSPlan",
    entityId: id,
  });
  return NextResponse.json({ success: true });
}
