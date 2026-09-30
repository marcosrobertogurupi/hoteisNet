import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin, hashPassword } from "@/lib/auth";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import { logPlatformAction } from "@/lib/platformAudit";

// Só papéis de HOTEL: o painel não cria conta de plataforma por aqui (seria elevação de privilégio).
const HOTEL_ROLES = ["TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"] as const;

// GET /api/admin/tenants/[id]/users — usuários de um assinante. Por padrão só os ativos (seletor de
// destinatário em Mensagens); com ?all=1 traz também os inativos, para a tela de gestão de usuários.
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const users = await prisma.user.findMany({
    where: { tenantId: id, ...(all ? {} : { active: true }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, isAuthorizer: true },
  });
  return NextResponse.json({ success: true, users });
}

// POST /api/admin/tenants/[id]/users — cria um usuário do hotel pelo painel da plataforma.
// Só PLATFORM_ADMIN / SUPER_ADMIN (o suporte só visualiza). O usuário nasce no assinante do caminho
// (que precisa existir). Sem senha no corpo, gera uma temporária que é devolvida UMA única vez.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  try {
    const { id } = await params;
    const body = await req.json();

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true, tradeName: true } });
    if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    if (!name || !email) {
      return NextResponse.json({ success: false, error: "Nome e e-mail são obrigatórios." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: "E-mail inválido." }, { status: 400 });
    }

    const role = (HOTEL_ROLES as readonly string[]).includes(body.role) ? (body.role as string) : "RECEPCIONIST";

    let password = String(body.password ?? "");
    let generated = false;
    if (!password) {
      generated = true;
      do {
        password = randomBytes(9).toString("base64url");
      } while (validatePasswordStrength(password));
    } else {
      const weak = validatePasswordStrength(password);
      if (weak) return NextResponse.json({ success: false, error: weak }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name,
        email,
        passwordHash,
        role: role as never,
        phone: body.phone ? String(body.phone).trim() : null,
        // Autorizador de eventos críticos (desconto acima do limite, anulação no caixa…).
        isAuthorizer: !!body.isAuthorizer,
      },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, isAuthorizer: true },
    });

    await logPlatformAction({
      req,
      session: session!,
      action: "TENANT_USER_CREATE",
      description: `Criou o usuário ${created.name} (${created.role}) no assinante ${tenant.tradeName || tenant.name}.`,
      targetTenantId: tenant.id,
      entityType: "USER",
      entityId: created.id,
      // nunca a senha nem o hash na trilha de auditoria
      details: { email: created.email, role: created.role, isAuthorizer: created.isAuthorizer, senhaGerada: generated },
    });

    return NextResponse.json({ success: true, user: created, ...(generated ? { tempPassword: password } : {}) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/admin/tenants/[id]/users] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao criar usuário." }, { status: 500 });
  }
}
