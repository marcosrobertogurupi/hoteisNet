import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import { getSessionUser, requireAdmin, hashPassword, getClientIp, getTerminalName, isPlatformRole } from "@/lib/auth";

// GET /api/users — lista os usuários do hotel da sessão (só admin). Contas da plataforma não entram
// no app do hotel (ver isTenantSession em lib/sessionToken.ts) — a equipe da plataforma gerencia
// usuários de assinantes pelo painel /admin (api/admin/tenants/[id]/users), com 2FA.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

  // Até 09/09/2026 o filtro incluía também o tenant de demonstração, então todo administrador de
  // todo hotel enxergava nome, e-mail, telefone e papel dos usuários dele (CLAUDE.md, Segurança §2).
  if (!session!.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão sem hotel associado." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: session!.tenantId! },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true, updatedAt: true,
      tenantId: true,
      tenant: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ success: true, users });
}

// POST /api/users — cria um novo usuário (só admin)
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

  try {
    const body = await req.json();
    const { name, email, password, role, phone } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "Nome, e-mail e senha são obrigatórios." }, { status: 400 });
    }
    const senhaFraca = validatePasswordStrength(password);
    if (senhaFraca) {
      return NextResponse.json({ success: false, error: senhaFraca }, { status: 400 });
    }

    // Só papéis de HOTEL: o app do hotel nunca cria conta da plataforma (SUPER_ADMIN e afins são
    // criados pelo painel /admin) — seria elevação de privilégio.
    const assignableRoles = ["TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"];
    const finalRole = assignableRoles.includes(role) ? role : "RECEPCIONIST";

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }

    // O usuário nasce SEMPRE no hotel da sessão — nunca num tenantId vindo do body (CLAUDE.md, §2).
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão sem hotel associado." }, { status: 403 });
    }
    const tenantId = session!.tenantId;

    const passwordHash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        tenantId,
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        passwordHash,
        role: finalRole,
        phone: phone ? String(phone).trim() : null,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, tenantId: true, tenant: { select: { id: true, name: true } } },
    });

    await logActivity({
      tenantId,
      userId: session!.userId,
      userName: session!.name,
      action: "USER_CREATE",
      description: `${session!.name} criou o usuário ${created.name} (${created.role}).`,
      entityType: "USER",
      entityId: created.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, user: created });
  } catch (error: any) {
    console.error("[POST /api/users] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao criar usuário." }, { status: 500 });
  }
}

// PATCH /api/users — atualiza nome/role/ativo/senha de um usuário (só admin)
export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

  try {
    const body = await req.json();
    const { id, name, role, active, password, phone } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do usuário é obrigatório." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, tenantId: true, role: true } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
    }
    // Administrador do hotel só altera usuários do próprio hotel.
    if (!session!.tenantId || target.tenantId !== session!.tenantId) {
      return NextResponse.json({ success: false, error: "Você não tem permissão para alterar esse usuário." }, { status: 403 });
    }
    if (id === session!.userId && active === false) {
      return NextResponse.json({ success: false, error: "Você não pode desativar a própria conta." }, { status: 400 });
    }

    // Só papéis de hotel — o app do hotel nunca atribui papel da plataforma.
    const validRoles = ["TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"];
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
    if (role !== undefined) {
      // Ninguém é promovido a papel da plataforma por aqui, nem tem o papel de plataforma alterado.
      if (!validRoles.includes(role) || isPlatformRole(target.role)) {
        return NextResponse.json({ success: false, error: "Você não tem permissão para atribuir esse papel." }, { status: 403 });
      }
      if (validRoles.includes(role)) data.role = role;
    }
    if (active !== undefined) data.active = !!active;
    if (password) {
      const senhaFraca = validatePasswordStrength(password);
      if (senhaFraca) {
        return NextResponse.json({ success: false, error: senhaFraca }, { status: 400 });
      }
      data.passwordHash = await hashPassword(password);
    }
    // Desativar, trocar de papel ou trocar a senha precisa derrubar qualquer sessão (JWT) já
    // emitida para esse usuário — sem isso, um funcionário desativado continuaria autenticado por
    // até 12h (duração do token) mesmo depois de perder o acesso no sistema.
    if (data.active === false || data.role !== undefined || data.passwordHash !== undefined) {
      data.tokenVersion = { increment: 1 };
    }

    // O filtro de tenant é repetido na PRÓPRIA escrita (não só na checagem de leitura acima) —
    // assim um refactor futuro que mexa na checagem não deixa a escrita desprotegida
    // (CLAUDE.md, Segurança §3).
    const changed = await prisma.user.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data,
    });
    if (changed.count === 0) {
      return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
    }
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, tenantId: true, tenant: { select: { id: true, name: true } } },
    });

    const auditTenantId = session!.tenantId;
    if (auditTenantId) {
      await logActivity({
        tenantId: auditTenantId,
        userId: session!.userId,
        userName: session!.name,
        action: "USER_UPDATE",
        description: `${session!.name} atualizou o usuário ${updated.name}.`,
        entityType: "USER",
        entityId: updated.id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    console.error("[PATCH /api/users] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar usuário." }, { status: 500 });
  }
}
