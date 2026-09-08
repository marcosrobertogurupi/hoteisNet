import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPlatformSession,
  requirePlatformAdmin,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_COOKIE_MAX_AGE,
  createImpersonationToken,
} from "@/lib/platformAuth";
import { logPlatformAction } from "@/lib/platformAudit";

// POST /api/admin/tenants/[id]/impersonate — "entrar como assinante". Emite para a equipe da
// plataforma uma sessão normal do TENANT_ADMIN daquele hotel (SESSION_COOKIE), para dar suporte
// vendo exatamente o que o assinante vê. A sessão do painel (PLATFORM_SESSION_COOKIE) continua
// intacta, então dá para voltar ao /admin a qualquer momento ("sair da personificação").
//
// Restrito a PLATFORM_ADMIN / SUPER_ADMIN. Toda personificação é registrada em PlatformAuditLog.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, name: true, tradeName: true, status: true },
  });
  if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });

  // Personifica sempre um TENANT_ADMIN ativo; se não houver, cai para qualquer usuário ativo.
  const target =
    (await prisma.user.findFirst({
      where: { tenantId: id, active: true, role: "TENANT_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, tokenVersion: true },
    })) ||
    (await prisma.user.findFirst({
      where: { tenantId: id, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, tokenVersion: true },
    }));

  if (!target) {
    return NextResponse.json(
      { success: false, error: "Este assinante não tem nenhum usuário ativo para personificar." },
      { status: 409 }
    );
  }

  const tenantLabel = tenant.tradeName || tenant.name;

  const sessionToken = await createSessionToken({
    userId: target.id,
    tenantId: id,
    email: target.email,
    name: target.name,
    role: target.role,
    tokenVersion: target.tokenVersion,
  });
  const impersonationToken = await createImpersonationToken({
    actorUserId: session!.userId,
    actorName: session!.name,
    tenantId: id,
    tenantName: tenantLabel,
  });

  const res = NextResponse.json({ success: true, tenantName: tenantLabel, redirectTo: "/app" });
  const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  res.cookies.set(SESSION_COOKIE, sessionToken, { ...cookieBase, maxAge: SESSION_COOKIE_MAX_AGE });
  res.cookies.set(IMPERSONATION_COOKIE, impersonationToken, { ...cookieBase, maxAge: IMPERSONATION_COOKIE_MAX_AGE });

  await logPlatformAction({
    req,
    session: session!,
    action: "TENANT_IMPERSONATE_START",
    description: `${session!.name} entrou como o assinante ${tenantLabel} (usuário ${target.name}).`,
    targetTenantId: id,
    entityType: "Tenant",
    entityId: id,
  });

  return res;
}
