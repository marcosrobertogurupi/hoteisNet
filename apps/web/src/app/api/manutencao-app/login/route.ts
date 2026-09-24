import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe, isAccountLocked, nextFailedLoginState, getClientIp } from "@/lib/auth";
import {
  createMaintenanceSessionToken,
  MAINTENANCE_SESSION_COOKIE,
  MAINTENANCE_SESSION_COOKIE_MAX_AGE,
} from "@/lib/maintenanceAuth";
import { checkRateLimit } from "@/lib/rateLimit";

const GENERIC_AUTH_ERROR = "Telefone ou senha inválidos.";

function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

// POST /api/manutencao-app/login — login do app de manutenção por telefone + senha (mesma senha do
// cadastro de Colaboradores). Só entra colaborador ativo, marcado como "Atende manutenção" e com
// senha. Rota legitimamente sem sessão (CLAUDE.md regra 1), com rate limit, comparação timing-safe
// e bloqueio por tentativas (regra 8). Emite cookie próprio, separado dos outros logins.
export async function POST(req: NextRequest) {
  try {
    const rate = await checkRateLimit(`maintenance-login:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Muitas tentativas. Tente novamente em instantes." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const phoneRaw = String(body?.phone || "").trim();
    const password = String(body?.password || "");
    if (!phoneRaw || !password.trim()) {
      return NextResponse.json({ success: false, error: "Telefone e senha são obrigatórios." }, { status: 400 });
    }

    const digits = onlyDigits(phoneRaw);
    if (digits.length < 8) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }

    // `phone` é texto livre ("(63) 98888-0001", "63988880001"...) — comparação por dígitos em memória
    // sobre os colaboradores de manutenção com senha (lista pequena; select só do necessário).
    const candidates = await prisma.employee.findMany({
      where: { active: true, maintenanceTech: true, passwordHash: { not: null } },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        tenant: { select: { theme: true } },
      },
    });
    const matches = candidates.filter((c) => onlyDigits(c.phone || "") === digits);
    // Mesmo telefone em hotéis diferentes: sem seletor de hotel no login, não adivinha.
    const employee = matches.length === 1 ? matches[0] : null;

    const validPassword = await verifyPasswordTimingSafe(password, employee?.passwordHash);

    if (!employee) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    // Mensagem genérica mesmo bloqueado — não revela que o telefone existe.
    if (isAccountLocked(employee.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (!validPassword) {
      await prisma.employee.update({ where: { id: employee.id }, data: nextFailedLoginState(employee.failedLoginAttempts) });
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (employee.failedLoginAttempts > 0) {
      await prisma.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    const token = await createMaintenanceSessionToken({
      employeeId: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
    });

    const res = NextResponse.json({
      success: true,
      employee: { id: employee.id, name: employee.name },
      theme: employee.tenant?.theme || "dark",
    });
    res.cookies.set(MAINTENANCE_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAINTENANCE_SESSION_COOKIE_MAX_AGE,
    });
    return res;
  } catch (error: any) {
    console.error("[POST /api/manutencao-app/login] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao autenticar." }, { status: 500 });
  }
}
