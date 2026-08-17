import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, hashPassword, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/users — lista os usuários do tenant (só admin)
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

  const tenantId = session!.tenantId || DEFAULT_TENANT_ID;

  const users = await prisma.user.findMany({
    where: { tenantId: { in: [tenantId, DEFAULT_TENANT_ID] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true },
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
    const { name, email, password, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "Nome, e-mail e senha são obrigatórios." }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const validRoles = ["SUPER_ADMIN", "TENANT_ADMIN", "RECEPCIONIST", "GOVERNESS", "FINANCIAL"];
    const finalRole = validRoles.includes(role) ? role : "RECEPCIONIST";

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ success: false, error: "Já existe um usuário com esse e-mail." }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const tenantId = session!.tenantId || DEFAULT_TENANT_ID;

    const created = await prisma.user.create({
      data: {
        tenantId,
        name: String(name).trim(),
        email: String(email).toLowerCase().trim(),
        passwordHash,
        role: finalRole,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
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

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = !!active;
    if (password) {
      if (String(password).length < 6) {
        return NextResponse.json({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, { status: 400 });
      }
      data.passwordHash = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true },
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
