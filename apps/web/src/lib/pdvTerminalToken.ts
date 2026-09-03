import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Token de autenticação de um caixa (PdvTerminal) — usado pelo agente fiscal .NET nas rotas
// /api/pdv/agente/* (nunca uma sessão de usuário). Guardamos só o hash SHA-256 no banco; o
// valor em claro é mostrado uma única vez no cadastro do caixa. tokenVersion no PdvTerminal
// permite revogar um token comprometido sem apagar o caixa.

const TOKEN_PREFIX = "pdvt_";

export function generateTerminalToken(): { token: string; tokenHash: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTerminalToken(token) };
}

export function hashTerminalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Comparação em tempo constante, para não vazar por timing se um hash bate parcialmente.
export function terminalTokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashTerminalToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
