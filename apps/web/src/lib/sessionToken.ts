import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Núcleo de sessão administrativa que NÃO depende de bcrypt nem do Prisma — só de `jose`.
// Separado de `lib/auth.ts` de propósito: o `middleware.ts` roda no Edge Runtime, que tem
// limite de 1 MB de bundle; importar `auth.ts` (que carrega bcryptjs + Prisma Client) estourava
// esse limite. O `middleware` importa só daqui; `auth.ts` reexporta tudo isto para as rotas.

export const SESSION_COOKIE = "hoteisnet_session";
export const TERMINAL_COOKIE = "hoteisnet_terminal";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  }
  return new TextEncoder().encode(secret);
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

// Papéis que contam como "admin" (controle total) — os demais são "usuário padrão"
// (inclusão/alteração, sem exclusão, sem acesso a Configurações/Usuários/Fiscal).
const ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_ADMIN"];

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconhecido";
}

export function getTerminalName(req: NextRequest): string {
  return req.cookies.get(TERMINAL_COOKIE)?.value || "desconhecido";
}
