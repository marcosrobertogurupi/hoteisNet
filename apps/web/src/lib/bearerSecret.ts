import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Confere `Authorization: Bearer <segredo>` contra uma variável de ambiente, timing-safe. Sem a env
// configurada, recusa tudo (nunca "aberto por padrão"). Usado pelas rotas sem sessão autenticadas
// por segredo próprio (CLAUDE.md, Segurança §1 e §5).
export function hasValidBearerSecret(req: NextRequest, envName: string): boolean {
  const expected = process.env[envName] || "";
  const received = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
