import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, hashPassword, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/users — lista usuários (SUPER_ADMIN vê todos os hotéis; TENANT_ADMIN só o seu)
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

  const isSuperAdmin = session!.role === "SUPER_ADMIN";
  const tenantId = session!.tenantId || DEFAULT_TENANT_ID;

  const users = await prisma.user.findMany({
    where: isSuperAdmin ? {} : { tenantId: { in: [tenantId, DEFAULT_TENANT_ID] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true,
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
    const { name, email, password, role, tenantId: requestedTenantId } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "Nome, e-mail e senha são obrigatórios." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const isSuperAdmin = session!.role === "SUPER_ADMIN";
    const validRoles = ["SUPER_ADMIN", "TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"];
    // TENANT_ADMIN não pode criar um SUPER_ADMIN (elevação de privilégio).
    const assignableRoles = isSuperAdmin ? validRoles : validRoles.filter((r) => r !== "SUPER_ADMIN");
    const finalRole = assignableRoles.includes(role) ? role : "RECEPCIONIST";

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }

    // Só SUPER_ADMIN pode escolher o hotel de destino; TENANT_ADMIN sempre cria no próprio tenant.
    let tenantId = session!.tenantId || DEFAULT_TENANT_ID;
    if (isSuperAdmin && requestedTenantId) {
      const targetTenant = await prisma.tenant.findUnique({ where: { id: requestedTenantId }, select: { id: true } });
      if (!targetTenant) {
        return NextResponse.json({ success: false, error: "Hotel de destino inválido." }, { status: 400 });
      }
      tenantId = targetTenant.id;
    }

    const passwordHash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        tenantId,
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        passwordHash,
        role: finalRole,
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
    const { id, name, role, active, password } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do usuário é obrigatório." }, { status: 400 });
    }

    const isSuperAdmin = session!.role === "SUPER_ADMIN";
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, tenantId: true, role: true } });
    if (!target) {
      return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
    }
    // TENANT_ADMIN só pode alterar usuários do próprio hotel.
    if (!isSuperAdmin && target.tenantId !== (session!.tenantId || DEFAULT_TENANT_ID)) {
      return NextResponse.json({ success: false, error: "Você não tem permissão para alterar esse usuário." }, { status: 403 });
    }
    if (id === session!.userId && active === false) {
      return NextResponse.json({ success: false, error: "Você não pode desativar a própria conta." }, { status: 400 });
    }

    const validRoles = ["SUPER_ADMIN", "TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"];
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (role !== undefined) {
      // TENANT_ADMIN não pode promover ninguém a SUPER_ADMIN nem alterar o papel de um SUPER_ADMIN.
      if (!isSuperAdmin && (role === "SUPER_ADMIN" || target.role === "SUPER_ADMIN")) {
        return NextResponse.json({ success: false, error: "Você não tem permissão para atribuir esse papel." }, { status: 403 });
      }
      if (validRoles.includes(role)) data.role = role;
    }
    if (active !== undefined) data.active = !!active;
    if (password) {
      if (String(password).length < 6) {
        return NextResponse.json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
      }
      data.passwordHash = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, tenantId: true, tenant: { select: { id: true, name: true } } },
      data,
    });

    await logActivity({
      tenantId: session!.tenantId || DEFAULT_TENANT_ID,
      userId: session!.userId,
      userName: session!.name,
      action: "USER_UPDATE",
      description: `${session!.name} atualizou o usuário ${updated.name}.`,
      entityType: "USER",
      entityId: updated.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    console.error("[PATCH /api/users] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar usuário." }, { status: 500 });
  }
}
