import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

// Sessão do app mobile de manutenção (/manutencao) — separada da sessão administrativa, da
// governança e da contagem de estoque. Quem entra é um Employee (cadastro de Colaboradores)
// marcado como "Atende manutenção", com login próprio por telefone + senha. Só `jose` aqui: o
// middleware (Edge Runtime) importa este arquivo.
export const MAINTENANCE_SESSION_COOKIE = "hoteisnet_maintenance_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — cobre um turno de trabalho

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  }
  return new TextEncoder().encode(secret);
}

export interface MaintenanceSessionPayload {
  // Marca o tipo de sessão: um token de outro app satélite assinado com o mesmo segredo não
  // passa por aqui (ver verifyMaintenanceSessionToken).
  kind: "maintenance";
  employeeId: string;
  tenantId: string;
  name: string;
}

export async function createMaintenanceSessionToken(payload: Omit<MaintenanceSessionPayload, "kind">): Promise<string> {
  return new SignJWT({ ...payload, kind: "maintenance" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyMaintenanceSessionToken(token: string): Promise<MaintenanceSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.kind !== "maintenance" || !payload.employeeId || !payload.tenantId) return null;
    return payload as unknown as MaintenanceSessionPayload;
  } catch {
    return null;
  }
}

export const MAINTENANCE_SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

export async function getMaintenanceSession(req: NextRequest): Promise<MaintenanceSessionPayload | null> {
  const token = req.cookies.get(MAINTENANCE_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyMaintenanceSessionToken(token);
}
