import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

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

export interface SessionPayload {
  userId: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: string;
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

// Lê e valida a sessão a partir do cookie httpOnly numa Route Handler (Node runtime).
export async function getSessionUser(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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
