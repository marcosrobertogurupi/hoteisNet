import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe, isAccountLocked, nextFailedLoginState, getClientIp } from "@/lib/auth";
import {
  createStockCountSessionToken,
  STOCK_COUNT_SESSION_COOKIE,
  STOCK_COUNT_SESSION_COOKIE_MAX_AGE,
} from "@/lib/stockCountAuth";
import { checkRateLimit } from "@/lib/rateLimit";

const GENERIC_AUTH_ERROR = "Telefone ou senha inválidos.";

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

// POST /api/stock-count/login — login do app mobile de contagem de estoque, por telefone + senha
// (o colaborador não tem e-mail/usuário). Emite cookie de sessão próprio, separado do login
// administrativo e do login da governança. Ver CLAUDE.md regra 8 (força bruta) e regra 1 (rota
// legitimamente sem sessão administrativa).
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(`stock-count-login:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Muitas tentativas. Tente novamente em instantes." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json();
    const phoneRaw = String(body.phone || "").trim();
    const password = String(body.password || "");

    if (!phoneRaw || !password.trim()) {
      return NextResponse.json({ success: false, error: "Telefone e senha são obrigatórios." }, { status: 400 });
    }

    const digits = onlyDigits(phoneRaw);
    if (digits.length < 8) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // Só colaboradores ativos e com senha definida podem entrar. O campo `phone` é texto livre e
    // pode estar formatado de várias formas ("(63) 98888-0001", "63988880001"...), então a
    // comparação é feita por dígitos em memória. O `select` traz só os campos escalares do login
    // (endpoint com rate limiting, não é lista/polling) — nunca a linha inteira.
    const candidates = await prisma.employee.findMany({
      where: { active: true, passwordHash: { not: null } },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
    const matches = candidates.filter((c) => onlyDigits(c.phone || "") === digits);
    // Telefone repetido em hotéis diferentes: sem seletor de hotel no login, não há como saber
    // qual — recusa com a mensagem genérica em vez de adivinhar.
    const employee = matches.length === 1 ? matches[0] : null;

    const validPassword = await verifyPasswordTimingSafe(password, employee?.passwordHash);

    if (!employee) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // Mensagem genérica mesmo com a conta bloqueada — não revela ao atacante que o telefone existe.
    if (isAccountLocked(employee.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    if (!validPassword) {
      const nextState = nextFailedLoginState(employee.failedLoginAttempts);
      await prisma.employee.update({ where: { id: employee.id }, data: nextState });
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (employee.failedLoginAttempts > 0) {
      await prisma.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    const token = await createStockCountSessionToken({
      employeeId: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      phone: employee.phone || phoneRaw,
    });

    const res = NextResponse.json({
      success: true,
      employee: { id: employee.id, name: employee.name, phone: employee.phone },
    });

    res.cookies.set(STOCK_COUNT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STOCK_COUNT_SESSION_COOKIE_MAX_AGE,
    });

    return res;
  } catch (error: any) {
    console.error("[POST /api/stock-count/login] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autenticar." }, { status: 500 });
  }
}
