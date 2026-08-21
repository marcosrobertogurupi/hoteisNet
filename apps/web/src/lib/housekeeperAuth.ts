import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Sessão do app mobile de governança — separada da sessão administrativa (auth.ts/SESSION_COOKIE)
// porque a governanta não é um User do sistema, é um Housekeeper com login próprio (WhatsApp+senha).
export const HOUSEKEEPER_SESSION_COOKIE = "hoteisnet_housekeeper_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 16; // 16h — cobre um turno de trabalho completo

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  }
  return new TextEncoder().encode(secret);
}

export interface HousekeeperSessionPayload {
  housekeeperId: string;
  tenantId: string;
  name: string;
  whatsapp: string;
}

export async function createHousekeeperSessionToken(payload: HousekeeperSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyHousekeeperSessionToken(token: string): Promise<HousekeeperSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as HousekeeperSessionPayload;
  } catch {
    return null;
  }
}

export const HOUSEKEEPER_SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

export async function getHousekeeperSession(req: NextRequest): Promise<HousekeeperSessionPayload | null> {
  const token = req.cookies.get(HOUSEKEEPER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyHousekeeperSessionToken(token);
}
