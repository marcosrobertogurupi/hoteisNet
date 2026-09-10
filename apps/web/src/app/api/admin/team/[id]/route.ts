import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin, hashPassword } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

const PLATFORM_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_SUPPORT"];

// PATCH /api/admin/team/[id] — altera papel/ativação ou reseta a senha de um membro da equipe.
// Edição: PLATFORM_ADMIN / SUPER_ADMIN. Só SUPER_ADMIN mexe em (ou promove a) SUPER_ADMIN.
// Toda mudança que reduz acesso incrementa tokenVersion (derruba a sessão na hora — CLAUDE.md §9).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: { role?: string; active?: boolean; resetPassword?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id, tenantId: null, role: { in: PLATFORM_ROLES as any } },
    select: { id: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ success: false, error: "Membro não encontrado." }, { status: 404 });

  const isSuper = session!.role === "SUPER_ADMIN";
  if (!isSuper && (target.role === "SUPER_ADMIN" || body.role === "SUPER_ADMIN")) {
    return NextResponse.json({ success: false, error: "Só um Super Admin altera outro Super Admin." }, { status: 403 });
  }
  if (id === session!.userId && (body.active === false || (body.role && body.role !== session!.role))) {
    return NextResponse.json({ success: false, error: "Você não pode rebaixar nem desativar a própria conta." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  let tempPassword: string | undefined;

  if (body.role !== undefined) {
    if (!PLATFORM_ROLES.includes(body.role)) return NextResponse.json({ success: false, error: "Papel inválido." }, { status: 400 });
    data.role = body.role;
  }
  if (body.active !== undefined) data.active = !!body.active;
  if (body.resetPassword) {
    tempPassword = randomBytes(9).toString("base64url");
    data.passwordHash = await hashPassword(tempPassword);
  }
  if (data.role !== undefined || data.active === false || data.passwordHash !== undefined) {
    data.tokenVersion = { increment: 1 };
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ success: false, error: "Nada para alterar." }, { status: 400 });
  }

  await prisma.user.update({ where: { id }, data });

  await logPlatformAction({
    req,
    session: session!,
    action: "TEAM_MEMBER_UPDATE",
    description: `Membro ${target.name}: ${Object.keys(data).filter((k) => k !== "tokenVersion").join(", ")}.`,
    entityType: "User",
    entityId: id,
  });

  return NextResponse.json({ success: true, ...(tempPassword ? { tempPassword } : {}) });
}
