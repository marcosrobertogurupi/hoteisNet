import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { validateCNPJ } from "@/lib/documentValidation";
import { lookupCep } from "@/lib/viaCep";

const TENANT_STATUSES = ["TRIAL", "ACTIVE", "OVERDUE", "SUSPENDED", "CANCELLED"] as const;
const TAX_REGIMES = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"] as const;

// GET /api/admin/tenants/[id] — ficha completa do assinante para a tela de edição do painel.
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tradeName: true,
      cnpj: true,
      stateRegistration: true,
      taxRegime: true,
      email: true,
      phone: true,
      website: true,
      zipCode: true,
      street: true,
      number: true,
      neighborhood: true,
      city: true,
      state: true,
      interestRate: true,
      logoUrl: true,
      status: true,
      accessValidUntil: true,
      internalNotes: true,
      createdAt: true,
      cpfQueryQuotaMonthly: true,
      cpfQueryUsed: true,
      cpfQueryEnabled: true,
      subscriptions: {
        where: { active: true },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { id: true, cycle: true, nextBilling: true, amount: true, plan: { select: { id: true, name: true } } },
      },
      aiAgentSettings: { select: { systemPromptExtra: true, tokenQuotaOverride: true, blocked: true } },
      _count: { select: { users: true, rooms: true } },
    },
  });
  if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });

  return NextResponse.json({ success: true, tenant });
}

// PATCH /api/admin/tenants/[id] — edita a ficha do assinante e os controles restritos ao painel
// (cota de CPF, prompt/cota/bloqueio de IA, status/suspensão). Edição: só PLATFORM_ADMIN /
// SUPER_ADMIN — PLATFORM_SUPPORT (que só visualiza) recebe 403. O assinante nunca edita isto.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  try {
    const { id } = await params;
    const body = await req.json();

    // --- Ficha do assinante (Tenant) — uma única update ao final ---
    const tenantData: Record<string, any> = {};
    const str = (v: unknown) => (String(v ?? "").trim() || null);

    if (body.name !== undefined) {
      if (!str(body.name)) return NextResponse.json({ success: false, error: "Razão social não pode ficar vazia." }, { status: 400 });
      tenantData.name = str(body.name);
    }
    if (body.tradeName !== undefined) tenantData.tradeName = str(body.tradeName);
    if (body.email !== undefined) {
      const e = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return NextResponse.json({ success: false, error: "E-mail inválido." }, { status: 400 });
      tenantData.email = e;
    }
    if (body.phone !== undefined) tenantData.phone = str(body.phone);
    if (body.website !== undefined) tenantData.website = str(body.website);
    if (body.stateRegistration !== undefined) tenantData.stateRegistration = str(body.stateRegistration);
    if (body.number !== undefined) tenantData.number = str(body.number);
    if (body.internalNotes !== undefined) tenantData.internalNotes = str(body.internalNotes);

    if (body.taxRegime !== undefined) {
      tenantData.taxRegime = (TAX_REGIMES as readonly string[]).includes(String(body.taxRegime)) ? body.taxRegime : null;
    }

    if (body.cnpj !== undefined) {
      const digits = String(body.cnpj || "").replace(/\D/g, "");
      if (digits && (digits.length !== 14 || !validateCNPJ(digits))) {
        return NextResponse.json({ success: false, error: "CNPJ inválido." }, { status: 400 });
      }
      if (digits) {
        const dup = await prisma.tenant.findFirst({ where: { cnpj: digits, id: { not: id } }, select: { id: true } });
        if (dup) return NextResponse.json({ success: false, error: "Já existe outro assinante com este CNPJ." }, { status: 409 });
      }
      tenantData.cnpj = digits || null;
    }

    if (body.interestRate !== undefined) {
      tenantData.interestRate =
        body.interestRate === null || body.interestRate === "" ? null : Number(body.interestRate);
    }

    if (body.accessValidUntil !== undefined) {
      if (body.accessValidUntil === null || body.accessValidUntil === "") {
        tenantData.accessValidUntil = null;
      } else {
        const d = new Date(body.accessValidUntil);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ success: false, error: "Data de validade do acesso inválida." }, { status: 400 });
        tenantData.accessValidUntil = d;
      }
    }

    if (body.status !== undefined) {
      if (!(TENANT_STATUSES as readonly string[]).includes(String(body.status))) {
        return NextResponse.json({ success: false, error: "Status inválido." }, { status: 400 });
      }
      tenantData.status = body.status;
    }

    // CEP: quando muda, cidade/UF são re-resolvidas pelo ViaCEP — nunca aceitas cruas do cliente
    // (regra do projeto). O campo `city`/`state` recebidos no body são ignorados de propósito.
    if (body.zipCode !== undefined) {
      const cep = String(body.zipCode || "").replace(/\D/g, "");
      tenantData.zipCode = cep || null;
      if (cep) {
        const via = await lookupCep(cep);
        if (via) {
          tenantData.street = via.street;
          tenantData.neighborhood = via.neighborhood;
          tenantData.city = via.city;
          tenantData.state = via.state;
        }
      }
    } else {
      // Sem troca de CEP, o painel ainda pode corrigir logradouro/bairro manualmente.
      if (body.street !== undefined) tenantData.street = str(body.street);
      if (body.neighborhood !== undefined) tenantData.neighborhood = str(body.neighborhood);
    }

    // --- Cota de consulta de CPF ---
    if (body.cpfQueryQuotaMonthly !== undefined) {
      const n = body.cpfQueryQuotaMonthly;
      if (typeof n !== "number" || n < 0 || !Number.isInteger(n)) {
        return NextResponse.json({ success: false, error: "cpfQueryQuotaMonthly deve ser inteiro ≥ 0." }, { status: 400 });
      }
      tenantData.cpfQueryQuotaMonthly = n;
    }
    if (body.cpfQueryEnabled !== undefined) tenantData.cpfQueryEnabled = !!body.cpfQueryEnabled;

    if (Object.keys(tenantData).length > 0) {
      await prisma.tenant.update({ where: { id }, data: tenantData });
    }

    // --- Config de IA (AIAgentSetting) — exclusiva do painel admin ---
    const { aiSystemPromptExtra, aiTokenQuotaOverride, aiBlocked } = body;
    if (aiSystemPromptExtra !== undefined || aiTokenQuotaOverride !== undefined || aiBlocked !== undefined) {
      if (aiTokenQuotaOverride !== undefined && aiTokenQuotaOverride !== null) {
        if (typeof aiTokenQuotaOverride !== "number" || aiTokenQuotaOverride < 0 || !Number.isInteger(aiTokenQuotaOverride)) {
          return NextResponse.json({ success: false, error: "aiTokenQuotaOverride deve ser inteiro ≥ 0 ou null." }, { status: 400 });
        }
      }
      const aiData: Record<string, any> = {};
      if (aiSystemPromptExtra !== undefined) aiData.systemPromptExtra = aiSystemPromptExtra || null;
      if (aiTokenQuotaOverride !== undefined) aiData.tokenQuotaOverride = aiTokenQuotaOverride;
      if (aiBlocked !== undefined) aiData.blocked = !!aiBlocked;
      await prisma.aIAgentSetting.upsert({ where: { tenantId: id }, create: { tenantId: id, ...aiData }, update: aiData });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        accessValidUntil: true,
        cpfQueryQuotaMonthly: true,
        cpfQueryUsed: true,
        cpfQueryEnabled: true,
        aiAgentSettings: { select: { systemPromptExtra: true, tokenQuotaOverride: true, blocked: true } },
      },
    });
    if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });

    const changedFields = Object.keys(body).filter((k) => body[k] !== undefined);
    await logPlatformAction({
      req,
      session: session!,
      action: body.status !== undefined ? "TENANT_STATUS_CHANGE" : "TENANT_UPDATE",
      description: `Assinante ${tenant.name}: ${changedFields.join(", ") || "—"}`,
      targetTenantId: id,
      entityType: "Tenant",
      entityId: id,
      details: Object.fromEntries(changedFields.map((k) => [k, body[k]])),
    });

    return NextResponse.json({ success: true, tenant });
  } catch (error: any) {
    console.error("[PATCH /api/admin/tenants/:id] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: "Erro ao atualizar assinante" }, { status: 500 });
  }
}
