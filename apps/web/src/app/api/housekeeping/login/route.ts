import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe, isAccountLocked, nextFailedLoginState, getClientIp } from "@/lib/auth";
import {
  createHousekeeperSessionToken,
  HOUSEKEEPER_SESSION_COOKIE,
  HOUSEKEEPER_SESSION_COOKIE_MAX_AGE,
} from "@/lib/housekeeperAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

const GENERIC_AUTH_ERROR = "WhatsApp ou senha inválidos.";

// POST /api/housekeeping/login — login do app mobile de governança, por WhatsApp + senha
// (a governanta não tem e-mail). Emite cookie de sessão próprio, separado do login administrativo.
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(`housekeeping-login:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Muitas tentativas. Tente novamente em instantes." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const { whatsapp, password } = body;

    if (!whatsapp?.trim() || !password?.trim()) {
      return NextResponse.json({ success: false, error: "WhatsApp e senha são obrigatórios." }, { status: 400 });
    }

    const housekeeper = await prisma.housekeeper.findFirst({
      where: { whatsapp: whatsapp.trim() },
    });

    const validPassword = await verifyPasswordTimingSafe(password, housekeeper?.passwordHash);

    if (!housekeeper || !housekeeper.active) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // Mensagem genérica igual à de credencial inválida mesmo com a conta bloqueada — evita
    // que o status revele a um atacante que aquele WhatsApp está cadastrado.
    if (isAccountLocked(housekeeper.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    if (!validPassword) {
      const nextState = nextFailedLoginState(housekeeper.failedLoginAttempts);
      await prisma.housekeeper.update({ where: { id: housekeeper.id }, data: nextState });
      return NextResponse.json({ success: false, error: "WhatsApp ou senha inválidos." }, { status: 401 });
    }
    if (housekeeper.failedLoginAttempts > 0) {
      await prisma.housekeeper.update({ where: { id: housekeeper.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    // Semeia a arrumação do dia (modo QUEUE) — a primeira governanta a entrar de manhã já
    // encontra a fila montada. Não bloqueia o login se falhar.
    try {
      await ensureDailyArrumacaoTasks(housekeeper.tenantId);
    } catch (e) {
      console.error("[POST /api/housekeeping/login] ensureDailyArrumacaoTasks falhou:", e);
    }

    const token = await createHousekeeperSessionToken({
      housekeeperId: housekeeper.id,
      tenantId: housekeeper.tenantId,
      name: housekeeper.name,
      whatsapp: housekeeper.whatsapp,
    });

    const res = NextResponse.json({
      success: true,
      housekeeper: { id: housekeeper.id, name: housekeeper.name, whatsapp: housekeeper.whatsapp, photoUrl: housekeeper.photoUrl },
    });

    res.cookies.set(HOUSEKEEPER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: HOUSEKEEPER_SESSION_COOKIE_MAX_AGE,
    });

    return res;
  } catch (error: any) {
    console.error("[POST /api/housekeeping/login] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autenticar." }, { status: 500 });
  }
}
