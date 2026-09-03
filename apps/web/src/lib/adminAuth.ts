import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe, isAdminRole, isAccountLocked, nextFailedLoginState } from "@/lib/auth";

// Autorização "step-up" reutilizável no BACKEND: confirma e-mail + senha de um usuário
// ADMIN/SUPER_ADMIN ativo do mesmo tenant, para liberar uma ação sensível (ex.: transferência
// de débito entre comandas). Diferente de /api/auth/verify-admin (que a UI chama antes), esta
// checagem roda DENTRO da rota que altera dados, para a autorização não depender só do cliente.
// Aplica o mesmo anti-força-bruta (timing-safe + bloqueio por tentativas) de lib/auth.

export type AdminStepUpResult =
  | { ok: true; admin: { id: string; name: string; role: string } }
  | { ok: false; status: number; error: string };

export async function verifyAdminStepUp(
  email: string | undefined,
  password: string | undefined,
  tenantId: string
): Promise<AdminStepUpResult> {
  if (!email || !password) {
    return { ok: false, status: 400, error: "Informe e-mail e senha do administrador." };
  }

  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);

  if (!user || !user.active || isAccountLocked(user.lockedUntil)) {
    return { ok: false, status: 401, error: "E-mail ou senha inválidos." };
  }
  if (!validPassword) {
    await prisma.user.update({ where: { id: user.id }, data: nextFailedLoginState(user.failedLoginAttempts) });
    return { ok: false, status: 401, error: "E-mail ou senha inválidos." };
  }
  if (user.failedLoginAttempts > 0) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }
  if (user.tenantId !== tenantId) {
    return { ok: false, status: 403, error: "Administrador de outro estabelecimento." };
  }
  if (!isAdminRole(user.role)) {
    return { ok: false, status: 403, error: "Este usuário não possui permissão de administrador." };
  }

  return { ok: true, admin: { id: user.id, name: user.name, role: user.role } };
}
