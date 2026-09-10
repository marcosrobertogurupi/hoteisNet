import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe, isAdminRole, isAccountLocked, nextFailedLoginState, getClientIp } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

// Autorização "step-up" reutilizável no BACKEND: confirma e-mail + senha de um usuário
// ADMIN/SUPER_ADMIN ativo do mesmo tenant, para liberar uma ação sensível (ex.: transferência
// de débito entre comandas). Roda DENTRO da rota que altera dados, para a autorização não
// depender só do cliente. Aplica o mesmo anti-força-bruta (timing-safe + bloqueio por
// tentativas) de lib/auth.
//
// O usuário é buscado JÁ filtrado pelo tenant (CLAUDE.md, Segurança §2): um administrador de
// outro hotel nunca deve conseguir autorizar nada aqui, e a resposta para ele precisa ser
// indistinguível de "senha errada" — senão a rota vira um oráculo para descobrir credenciais
// válidas de administradores de qualquer assinante.

export type AdminStepUpResult =
  | { ok: true; admin: { id: string; name: string; role: string } }
  | { ok: false; status: number; error: string };

const GENERIC_AUTH_ERROR = "E-mail ou senha inválidos.";

export async function verifyAdminStepUp(
  req: NextRequest,
  email: string | undefined,
  password: string | undefined,
  tenantId: string
): Promise<AdminStepUpResult> {
  if (!email || !password) {
    return { ok: false, status: 400, error: "Informe e-mail e senha do administrador." };
  }
  if (!tenantId) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  // O rate limit mora aqui, e não em cada rota, para que nenhuma rota de step-up futura possa
  // esquecê-lo: toda porta que aceita e-mail + senha de administrador passa por este ponto
  // (CLAUDE.md, Segurança §8).
  const rate = await checkRateLimit(`admin-step-up:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Muitas tentativas de autorização. Tente novamente em ${rate.retryAfterSeconds}s.`,
    };
  }

  const user = await prisma.user.findFirst({
    where: { email: String(email).toLowerCase().trim(), tenantId },
    select: {
      id: true,
      name: true,
      role: true,
      active: true,
      passwordHash: true,
      failedLoginAttempts: true,
      lockedUntil: true,
    },
  });
  // Sempre compara a senha, mesmo sem usuário, para que o tempo de resposta não denuncie
  // quais e-mails existem neste hotel.
  const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);

  if (!user || !user.active || isAccountLocked(user.lockedUntil)) {
    return { ok: false, status: 401, error: GENERIC_AUTH_ERROR };
  }
  if (!validPassword) {
    await prisma.user.update({
      where: { id: user.id },
      data: nextFailedLoginState(user.failedLoginAttempts),
      select: { id: true },
    });
    return { ok: false, status: 401, error: GENERIC_AUTH_ERROR };
  }
  if (user.failedLoginAttempts > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: { id: true },
    });
  }
  if (!isAdminRole(user.role)) {
    return { ok: false, status: 403, error: "Este usuário não possui permissão de administrador." };
  }

  return { ok: true, admin: { id: user.id, name: user.name, role: user.role } };
}
