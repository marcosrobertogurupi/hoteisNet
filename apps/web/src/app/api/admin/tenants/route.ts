import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin, hashPassword } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { validateCNPJ } from "@/lib/documentValidation";
import { lookupCep } from "@/lib/viaCep";
import { provisionBillingForTenant } from "@/lib/saasBilling";

const TENANT_STATUSES = ["TRIAL", "ACTIVE", "OVERDUE", "SUSPENDED", "CANCELLED"] as const;
const TAX_REGIMES = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"] as const;

// GET /api/admin/tenants — lista de assinantes do painel. Leitura: qualquer papel de plataforma
// (inclui PLATFORM_SUPPORT, que só visualiza). Aceita ?q= (nome/fantasia/CNPJ/cidade), ?status=,
// ?page= e ?pageSize= (default 50, máx 100). Sem parâmetros, devolve a 1ª página.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const statusFilter = (searchParams.get("status") || "").trim().toUpperCase();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 50));

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { tradeName: { contains: q, mode: "insensitive" } },
        { cnpj: { contains: q.replace(/\D/g, "") || q } },
        { city: { contains: q, mode: "insensitive" } },
      ];
    }
    if ((TENANT_STATUSES as readonly string[]).includes(statusFilter)) {
      where.status = statusFilter;
    }

    const [total, tenants] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          tradeName: true,
          cnpj: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          status: true,
          accessValidUntil: true,
          createdAt: true,
          cpfQueryQuotaMonthly: true,
          cpfQueryUsed: true,
          cpfQueryCycleStart: true,
          cpfQueryEnabled: true,
          subscriptions: {
            where: { active: true },
            orderBy: { startDate: "desc" },
            take: 1,
            select: { plan: { select: { name: true, aiTokenQuota: true, priceMonthly: true } }, nextBilling: true },
          },
          aiAgentSettings: {
            select: { systemPromptExtra: true, operationalSystemPromptExtra: true, tokenQuotaOverride: true, blocked: true },
          },
          _count: { select: { users: true, rooms: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      page,
      pageSize,
      total,
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        tradeName: t.tradeName,
        cnpj: t.cnpj,
        email: t.email,
        phone: t.phone,
        city: t.city,
        state: t.state,
        status: t.status,
        accessValidUntil: t.accessValidUntil,
        createdAt: t.createdAt,
        usersCount: t._count.users,
        roomsCount: t._count.rooms,
        planName: t.subscriptions[0]?.plan?.name || null,
        planAiTokenQuota: t.subscriptions[0]?.plan?.aiTokenQuota ?? null,
        planPriceMonthly: t.subscriptions[0]?.plan?.priceMonthly ?? null,
        nextBilling: t.subscriptions[0]?.nextBilling ?? null,
        cpfQueryQuotaMonthly: t.cpfQueryQuotaMonthly,
        cpfQueryUsed: t.cpfQueryUsed,
        cpfQueryCycleStart: t.cpfQueryCycleStart,
        cpfQueryEnabled: t.cpfQueryEnabled,
        aiSystemPromptExtra: t.aiAgentSettings?.systemPromptExtra || "",
        aiOperationalPromptExtra: t.aiAgentSettings?.operationalSystemPromptExtra || "",
        aiTokenQuotaOverride: t.aiAgentSettings?.tokenQuotaOverride ?? null,
        aiBlocked: t.aiAgentSettings?.blocked || false,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/tenants] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao buscar assinantes" }, { status: 500 });
  }
}

// POST /api/admin/tenants — cria um novo assinante e provisiona o ambiente dele numa única
// transação: Tenant + assinatura + config de IA + 1º usuário TENANT_ADMIN. Só o painel admin
// cria assinante (o assinante nunca se auto-cadastra). Edição: PLATFORM_ADMIN / SUPER_ADMIN.
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

  const name = String(body.name || "").trim(); // razão social
  const email = String(body.email || "").trim().toLowerCase();
  const adminName = String(body.adminName || "").trim();
  const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
  const planId = String(body.planId || "").trim();

  if (!name) return NextResponse.json({ success: false, error: "Razão social é obrigatória." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ success: false, error: "E-mail do assinante inválido." }, { status: 400 });
  }
  if (!adminName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return NextResponse.json({ success: false, error: "Nome e e-mail do primeiro administrador são obrigatórios." }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ success: false, error: "Selecione um plano." }, { status: 400 });

  const cnpjDigits = String(body.cnpj || "").replace(/\D/g, "");
  if (cnpjDigits) {
    if (cnpjDigits.length !== 14 || !validateCNPJ(cnpjDigits)) {
      return NextResponse.json({ success: false, error: "CNPJ inválido." }, { status: 400 });
    }
    const dup = await prisma.tenant.findUnique({ where: { cnpj: cnpjDigits }, select: { id: true } });
    if (dup) return NextResponse.json({ success: false, error: "Já existe um assinante com este CNPJ." }, { status: 409 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existingUser) {
    return NextResponse.json({ success: false, error: "Já existe um usuário com o e-mail do administrador informado." }, { status: 409 });
  }

  const plan = await prisma.saaSPlan.findUnique({
    where: { id: planId },
    select: { id: true, priceMonthly: true, priceSemiannual: true, priceAnnual: true, trialDays: true },
  });
  if (!plan) return NextResponse.json({ success: false, error: "Plano não encontrado." }, { status: 404 });

  // Ciclo contratado. Semestral/anual só valem se o plano tiver preço para o ciclo.
  const cycle = ["MONTHLY", "SEMIANNUAL", "ANNUAL"].includes(String(body.cycle)) ? String(body.cycle) : "MONTHLY";
  const cyclePrice =
    cycle === "ANNUAL" ? plan.priceAnnual : cycle === "SEMIANNUAL" ? plan.priceSemiannual : plan.priceMonthly;
  if (cyclePrice == null) {
    return NextResponse.json({ success: false, error: "Este plano não oferece o ciclo escolhido." }, { status: 400 });
  }

  const taxRegime = (TAX_REGIMES as readonly string[]).includes(String(body.taxRegime))
    ? (body.taxRegime as (typeof TAX_REGIMES)[number])
    : null;

  // Cidade/UF nunca vêm do cliente — resolvidas do CEP pelo ViaCEP (regra do projeto).
  const cep = String(body.zipCode || "").replace(/\D/g, "");
  const via = cep ? await lookupCep(cep) : null;

  const accessValidUntil = body.accessValidUntil ? new Date(body.accessValidUntil) : null;
  if (accessValidUntil && Number.isNaN(accessValidUntil.getTime())) {
    return NextResponse.json({ success: false, error: "Data de validade do acesso inválida." }, { status: 400 });
  }
  // nextBilling / accessValidUntil: a data informada; senão, hoje + trialDays do plano (mín. 1 dia
  // para não nascer vencido), ou +30 dias quando o plano não tem trial.
  const trialMs = (plan.trialDays > 0 ? plan.trialDays : 30) * 24 * 60 * 60 * 1000;
  const nextBilling = accessValidUntil ?? new Date(Date.now() + trialMs);
  const effectiveAccessUntil = accessValidUntil ?? nextBilling;

  const tempPassword = randomBytes(9).toString("base64url"); // ~12 chars, entregue uma única vez ao admin
  const passwordHash = await hashPassword(tempPassword);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          tradeName: String(body.tradeName || "").trim() || null,
          cnpj: cnpjDigits || null,
          email,
          phone: String(body.phone || "").trim() || null,
          website: String(body.website || "").trim() || null,
          stateRegistration: String(body.stateRegistration || "").trim() || null,
          taxRegime,
          zipCode: cep || null,
          street: via?.street ?? (String(body.street || "").trim() || null),
          number: String(body.number || "").trim() || null,
          neighborhood: via?.neighborhood ?? (String(body.neighborhood || "").trim() || null),
          city: via?.city ?? null,
          state: via?.state ?? null,
          interestRate:
            body.interestRate === undefined || body.interestRate === null || body.interestRate === ""
              ? null
              : Number(body.interestRate),
          accessValidUntil: effectiveAccessUntil,
          internalNotes: String(body.internalNotes || "").trim() || null,
          status: "TRIAL",
        },
        select: { id: true, name: true },
      });

      await tx.saASSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          cycle: cycle as "MONTHLY" | "SEMIANNUAL" | "ANNUAL",
          amount: cyclePrice,
          nextBilling,
          billingType: ["BOLETO", "PIX", "CREDIT_CARD"].includes(String(body.billingType))
            ? String(body.billingType)
            : "UNDEFINED",
          active: true,
        },
      });
      await tx.aIAgentSetting.create({ data: { tenantId: tenant.id } });
      const adminUser = await tx.user.create({
        data: { tenantId: tenant.id, name: adminName, email: adminEmail, passwordHash, role: "TENANT_ADMIN", active: true },
        select: { id: true, email: true },
      });

      return { tenant, adminUser };
    });

    // Cobrança no Asaas — fora da transação (chamada externa). Best-effort: se falhar ou não
    // estiver configurado, o assinante fica em cobrança manual.
    const billing = await provisionBillingForTenant(created.tenant.id);

    await logPlatformAction({
      req,
      session: session!,
      action: "TENANT_CREATE",
      description: `Assinante criado: ${created.tenant.name} (cobrança ${billing.mode})`,
      targetTenantId: created.tenant.id,
      entityType: "Tenant",
      entityId: created.tenant.id,
      details: { planId: plan.id, cycle, adminEmail: created.adminUser.email, billing },
    });

    return NextResponse.json({
      success: true,
      tenantId: created.tenant.id,
      admin: { email: created.adminUser.email, tempPassword },
      billing,
    });
  } catch (error) {
    console.error("[POST /api/admin/tenants] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao criar assinante." }, { status: 500 });
  }
}
