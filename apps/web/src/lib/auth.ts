import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "hoteisnet_session";
export const TERMINAL_COOKIE = "hoteisnet_terminal";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Hash bcrypt válido de uma senha que nunca será usada de verdade — comparado no lugar da senha
// real quando o e-mail informado não existe, para que o tempo de resposta de "e-mail não
// cadastrado" seja igual ao de "senha errada" (evita enumeração de e-mail por timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("hoteisnet-dummy-timing-safe-compare", 10);

export async function verifyPasswordTimingSafe(plain: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(plain, hash || DUMMY_PASSWORD_HASH);
}

// Proteção contra força bruta: aplicável tanto a User quanto a Housekeeper (ambos têm
// failedLoginAttempts/lockedUntil). Chamar registerFailedLogin após senha inválida e
// resetLoginAttempts após login bem-sucedido.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function isAccountLocked(lockedUntil: Date | null | undefined): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

export function lockoutRemainingMinutes(lockedUntil: Date | null | undefined): number {
  if (!isAccountLocked(lockedUntil)) return 0;
  return Math.ceil((lockedUntil!.getTime() - Date.now()) / 60000);
}

// Calcula o próximo estado de tentativas/bloqueio após uma senha incorreta — o caller (que sabe
// se é User ou Housekeeper) aplica o resultado com prisma.<model>.update.
export function nextFailedLoginState(currentFailedAttempts: number): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const attempts = currentFailedAttempts + 1;
  if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}

export interface SessionPayload {
  userId: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

// Papéis que contam como "admin" (controle total) — os demais são "usuário padrão"
// (inclusão/alteração, sem exclusão, sem acesso a Configurações/Usuários/Fiscal).
const ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_ADMIN"];

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

// Lê e valida a sessão a partir do cookie httpOnly numa Route Handler (Node runtime). Além de
// verificar a assinatura/expiração do JWT, revalida contra o banco que o usuário ainda está ativo
// e que o tokenVersion do token bate com o atual — isso garante que desativar um usuário, mudar
// seu role ou trocar a senha derruba imediatamente qualquer sessão já emitida, em vez de esperar
// o JWT expirar sozinho (até 12h depois).
export async function getSessionUser(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { active: true, tokenVersion: true },
  });
  if (!user || !user.active || user.tokenVersion !== payload.tokenVersion) return null;

  return payload;
}

// Retorna um erro 403 padronizado quando a sessão atual não é admin; caller deve
// checar `if (result) return result;` antes de prosseguir com a operação.
export function requireAdmin(session: SessionPayload | null): { status: number; body: { success: false; error: string } } | null {
  if (!session || !isAdminRole(session.role)) {
    return { status: 403, body: { success: false, error: "Ação restrita a administradores." } };
  }
  return null;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconhecido";
}

export function getTerminalName(req: NextRequest): string {
  return req.cookies.get(TERMINAL_COOKIE)?.value || "desconhecido";
}
