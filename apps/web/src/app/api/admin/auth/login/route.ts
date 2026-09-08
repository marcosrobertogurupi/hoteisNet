import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPasswordTimingSafe,
  isAccountLocked,
  nextFailedLoginState,
  getClientIp,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  PLATFORM_SESSION_COOKIE,
  PLATFORM_SESSION_COOKIE_MAX_AGE,
  createPlatformSessionToken,
  isPlatformRole,
} from "@/lib/platformAuth";
import { verifyTotp } from "@/lib/totp";
import { logPlatformAction } from "@/lib/platformAudit";

const GENERIC_AUTH_ERROR = "E-mail ou senha inválidos.";

// POST /api/admin/auth/login — login da EQUIPE DA PLATAFORMA no painel /admin. Sessão e cookie
// próprios (PLATFORM_SESSION_COOKIE), separados do app do assinante. Mesmos helpers anti-força-bruta
// do login normal (CLAUDE.md §8): comparação timing-safe + bloqueio por tentativas + rate limit.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`admin-login:${ip}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Muitas tentativas. Tente novamente em instantes." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const { email, password, mfaCode } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
    const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);

    if (!user || !user.active || isAccountLocked(user.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (!validPassword) {
      await prisma.user.update({ where: { id: user.id }, data: nextFailedLoginState(user.failedLoginAttempts) });
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    // A conta existe e a senha confere, mas não é da equipe da plataforma → mesma mensagem genérica.
    if (!isPlatformRole(user.role)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // 2FA: senha correta, mas a conta exige o segundo fator.
    if (user.mfaEnabled && user.mfaSecret) {
      if (!mfaCode) {
        return NextResponse.json({ success: false, mfaRequired: true, error: "Informe o código do aplicativo autenticador." }, { status: 401 });
      }
      if (!verifyTotp(user.mfaSecret, String(mfaCode))) {
        return NextResponse.json({ success: false, mfaRequired: true, error: "Código de verificação inválido." }, { status: 401 });
      }
    }

    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    const token = await createPlatformSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    const res = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
    res.cookies.set(PLATFORM_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PLATFORM_SESSION_COOKIE_MAX_AGE,
    });

    await logPlatformAction({
      req,
      session: { userId: user.id, name: user.name, role: user.role },
      action: "PLATFORM_LOGIN",
      description: `${user.name} entrou no painel da plataforma.`,
    });

    return res;
  } catch (error) {
    console.error("[POST /api/admin/auth/login] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao autenticar." }, { status: 500 });
  }
}
