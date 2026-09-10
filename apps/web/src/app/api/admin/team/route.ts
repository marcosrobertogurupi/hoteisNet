import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin, hashPassword } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

const PLATFORM_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_SUPPORT"];

// GET /api/admin/team — a equipe do painel da plataforma (User com tenantId nulo).
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const members = await prisma.user.findMany({
    where: { tenantId: null, role: { in: PLATFORM_ROLES as any } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json({ success: true, me: session!.userId, members });
}

// POST /api/admin/team — cria um membro da equipe. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
// Só SUPER_ADMIN pode criar outro SUPER_ADMIN.
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: { name?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "");
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ success: false, error: "Nome e e-mail válidos são obrigatórios." }, { status: 400 });
  }
  if (!PLATFORM_ROLES.includes(role)) {
    return NextResponse.json({ success: false, error: "Papel inválido." }, { status: 400 });
  }
  if (role === "SUPER_ADMIN" && session!.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Só um Super Admin cria outro Super Admin." }, { status: 403 });
  }

  const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: "Já existe um usuário com este e-mail." }, { status: 409 });

  const tempPassword = randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: role as any, tenantId: null, active: true },
    select: { id: true, email: true },
  });

  await logPlatformAction({
    req,
    session: session!,
    action: "TEAM_MEMBER_CREATE",
    description: `Membro da equipe criado: ${name} (${role}).`,
    entityType: "User",
    entityId: user.id,
  });

  return NextResponse.json({ success: true, id: user.id, tempPassword, email: user.email });
}
