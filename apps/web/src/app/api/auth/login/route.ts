import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { resolveTerminalLabel } from "@/lib/terminal";
import {
  verifyPasswordTimingSafe,
  createSessionToken,
  isAccountLocked,
  lockoutRemainingMinutes,
  nextFailedLoginState,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE,
  TERMINAL_COOKIE,
  getClientIp,
} from "@/lib/auth";

// POST /api/auth/login — autentica por e-mail/senha, emite o cookie de sessão (JWT httpOnly)
// e o cookie de terminal (IP/hostname resolvidos automaticamente, usados depois na auditoria).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });

    // Comparação sempre roda (mesmo com usuário inexistente, contra um hash dummy) para o tempo de
    // resposta não vazar por timing se o e-mail existe ou não.
    const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);

    if (!user || !user.active) {
      return NextResponse.json({ success: false, error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    if (isAccountLocked(user.lockedUntil)) {
      return NextResponse.json(
        { success: false, error: `Muitas tentativas de login incorretas. Tente novamente em ${lockoutRemainingMinutes(user.lockedUntil)} minuto(s).` },
        { status: 429 }
      );
    }

    if (!validPassword) {
      const nextState = nextFailedLoginState(user.failedLoginAttempts);
      await prisma.user.update({ where: { id: user.id }, data: nextState });
      return NextResponse.json({ success: false, error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    const token = await createSessionToken({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    const res = NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    });

    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });

    // Terminal identificado automaticamente pelo servidor (IP de quem logou, com hostname via
    // DNS reverso quando a rede permitir) — nunca digitado pelo usuário.
    const ip = getClientIp(req);
    const terminalLabel = await resolveTerminalLabel(ip);

    res.cookies.set(TERMINAL_COOKIE, terminalLabel, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    await logActivity({
      tenantId: user.tenantId || "tenant-hoteisnet-demo",
      userId: user.id,
      userName: user.name,
      action: "LOGIN",
      description: `${user.name} entrou no sistema.`,
      entityType: "AUTH",
      terminal: terminalLabel,
      ipAddress: ip,
    });

    return res;
  } catch (error: any) {
    console.error("[POST /api/auth/login] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autenticar." }, { status: 500 });
  }
}
