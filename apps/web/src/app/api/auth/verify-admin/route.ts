import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, verifyPasswordTimingSafe, isAdminRole, isAccountLocked, nextFailedLoginState, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";
const GENERIC_AUTH_ERROR = "E-mail ou senha inválidos.";

// POST /api/auth/verify-admin — autorização pontual ("step-up"): confirma que e-mail+senha
// pertencem a um usuário ADMIN/SUPER_ADMIN ativo, sem abrir sessão nem trocar o operador
// logado no terminal. Usado para liberar ações sensíveis (ex: cortesia de check-in de
// madrugada) que exigem aprovação de um administrador, mantendo o registro de quem autorizou.
// Exige uma sessão já autenticada (qualquer usuário do terminal) — não é um endpoint público, para
// não virar um segundo oráculo de força-bruta contra credenciais de administrador.
export async function POST(req: NextRequest) {
  try {
    const callerSession = await getSessionUser(req);
    if (!callerSession) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { email, password, reason } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);

    if (!user || !user.active) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    if (isAccountLocked(user.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    if (!validPassword) {
      const nextState = nextFailedLoginState(user.failedLoginAttempts);
      await prisma.user.update({ where: { id: user.id }, data: nextState });
      return NextResponse.json({ success: false, error: "E-mail ou senha inválidos." }, { status: 401 });
    }
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    if (!isAdminRole(user.role)) {
      return NextResponse.json({ success: false, error: "Este usuário não possui permissão de administrador." }, { status: 403 });
    }

    const tenantId = user.tenantId || DEFAULT_TENANT_ID;

    await logActivity({
      tenantId,
      userId: user.id,
      userName: user.name,
      action: "ADMIN_STEP_UP_AUTH",
      description: `${user.name} autorizou com senha de administrador: ${reason || "ação sensível"}.`,
      entityType: "AUTH",
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      admin: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error: any) {
    console.error("[POST /api/auth/verify-admin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autorizar." }, { status: 500 });
  }
}
