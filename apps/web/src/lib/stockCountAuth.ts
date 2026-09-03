import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Sessão do app mobile de contagem de estoque — separada da sessão administrativa
// (auth.ts/SESSION_COOKIE) e da sessão da governança. Quem faz a contagem é um Employee
// (cadastro de Colaboradores) com login próprio por telefone + senha, não um User do sistema.
export const STOCK_COUNT_SESSION_COOKIE = "hoteisnet_stockcount_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — cobre um turno de trabalho

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  }
  return new TextEncoder().encode(secret);
}

export interface StockCountSessionPayload {
  employeeId: string;
  tenantId: string;
  name: string;
  phone: string;
}

export async function createStockCountSessionToken(payload: StockCountSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyStockCountSessionToken(token: string): Promise<StockCountSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as StockCountSessionPayload;
  } catch {
    return null;
  }
}

export const STOCK_COUNT_SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

export async function getStockCountSession(req: NextRequest): Promise<StockCountSessionPayload | null> {
  const token = req.cookies.get(STOCK_COUNT_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyStockCountSessionToken(token);
}
