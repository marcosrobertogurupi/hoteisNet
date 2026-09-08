import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Sessão do PAINEL DA PLATAFORMA (/admin) — cookie e JWT próprios, separados da sessão do app do
// assinante (auth.ts / SESSION_COOKIE) e dos apps satélite. A equipe do SaaS entra por
// /admin/login; o back-office fica isolado do produto (decisão D4 do PLANO_PAINEL_ADMIN.md).
//
// Este arquivo é jose-only (sem bcrypt/Prisma) porque o middleware (Edge Runtime, limite de 1 MB)
// importa `verifyPlatformSessionToken` daqui. A revalidação no banco (usuário ativo, tokenVersion,
// ainda é papel de plataforma) fica em `getPlatformSession`, em lib/auth.ts (Node).

export const PLATFORM_SESSION_COOKIE = "hoteisnet_platform_session";
export const IMPERSONATION_COOKIE = "hoteisnet_impersonation";

const PLATFORM_SESSION_MAX_AGE = 60 * 60 * 12; // 12h
const IMPERSONATION_MAX_AGE = 60 * 60 * 2; // 2h — sessão de suporte "entrar como" é curta de propósito
export const PLATFORM_SESSION_COOKIE_MAX_AGE = PLATFORM_SESSION_MAX_AGE;
export const IMPERSONATION_COOKIE_MAX_AGE = IMPERSONATION_MAX_AGE;

const PLATFORM_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_SUPPORT"];
const PLATFORM_EDIT_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN"];

export function isPlatformRole(role: string | null | undefined): boolean {
  return !!role && PLATFORM_ROLES.includes(role);
}
export function isPlatformEditRole(role: string | null | undefined): boolean {
  return !!role && PLATFORM_EDIT_ROLES.includes(role);
}

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  return new TextEncoder().encode(secret);
}

export interface PlatformSessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  tokenVersion: number;
}

export async function createPlatformSessionToken(payload: PlatformSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PLATFORM_SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifyPlatformSessionToken(token: string): Promise<PlatformSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as PlatformSessionPayload;
  } catch {
    return null;
  }
}

// --- Personificação ("entrar como assinante") ---
// Marcador separado do SESSION_COOKIE do app: durante a personificação, o SESSION_COOKIE é uma
// sessão normal do TENANT_ADMIN daquele hotel; este cookie só carrega quem está personificando
// (para o banner de aviso, a auditoria e o "sair da personificação").

export interface ImpersonationPayload {
  actorUserId: string;
  actorName: string;
  tenantId: string;
  tenantName: string;
}

export async function createImpersonationToken(payload: ImpersonationPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${IMPERSONATION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifyImpersonationToken(token: string): Promise<ImpersonationPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as ImpersonationPayload;
  } catch {
    return null;
  }
}

export async function getImpersonation(req: NextRequest): Promise<ImpersonationPayload | null> {
  const token = req.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  return verifyImpersonationToken(token);
}
