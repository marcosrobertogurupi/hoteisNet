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

// Papéis da equipe do SaaS que têm acesso ao painel /admin (User com tenantId nulo).
// PLATFORM_SUPPORT só visualiza; PLATFORM_ADMIN e SUPER_ADMIN também editam (ver requirePlatformAdmin).
const PLATFORM_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_SUPPORT"];
const PLATFORM_EDIT_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN"];

export function isPlatformRole(role: string | null | undefined): boolean {
  return !!role && PLATFORM_ROLES.includes(role);
}

export function isPlatformEditRole(role: string | null | undefined): boolean {
  return !!role && PLATFORM_EDIT_ROLES.includes(role);
}

// Sessão válida para o APP DO HOTEL (/principal e /api/** do assinante): precisa ter um hotel
// (tenantId) e NÃO pode ser de conta da equipe da plataforma. Conta da plataforma entra só pelo
// painel /admin (login com 2FA) e atua num hotel pela personificação ("Entrar como assinante"),
// que emite uma sessão em nome do administrador DAQUELE hotel — nunca da própria conta.
// Antes, uma conta SUPER_ADMIN entrava direto pelo login do hotel, sem 2FA, e por /api/users
// listava e alterava usuários de todos os hotéis.
export function isTenantSession(session: { tenantId?: string | null; role?: string | null } | null | undefined): boolean {
  return !!session?.tenantId && !isPlatformRole(session.role);
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconhecido";
}

export function getTerminalName(req: NextRequest): string {
  return req.cookies.get(TERMINAL_COOKIE)?.value || "desconhecido";
}
