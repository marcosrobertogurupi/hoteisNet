import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// `state` de OAuth assinado (HMAC-SHA256) para callbacks PÚBLICOS que precisam saber a qual tenant
// pertence a conexão — ex.: /api/tenant/reviews/meta/callback. O callback não pode confiar no
// cookie de sessão (navegação de topo entre domínios), então o tenantId viaja no `state`. Enquanto
// ele era só um JSON em base64, qualquer pessoa montava `{"tenantId":"<outro hotel>"}`, concluía o
// OAuth com a própria conta do Facebook e sobrescrevia os conectores de outro assinante. Com a
// assinatura, só um `state` emitido por este servidor (na rota de connect, que exige admin da
// sessão) é aceito, e ele expira sozinho.
//
// A chave é o SESSION_SECRET (já obrigatório) — nunca um literal no código (CLAUDE.md, Segurança §6).

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado — defina essa variável de ambiente.");
  return Buffer.from(`oauth-state:v1:${secret}`, "utf8");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getKey()).update(payloadB64).digest("base64url");
}

export function createOAuthState(tenantId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload = { tenantId, nonce: randomBytes(12).toString("base64url"), exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Devolve o tenantId do `state` se a assinatura confere e ainda não expirou; senão null. */
export function verifyOAuthState(state: string | null | undefined): { tenantId: string } | null {
  if (!state) return null;
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = Buffer.from(sign(payloadB64));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (typeof payload?.tenantId !== "string" || !payload.tenantId) return null;
    if (typeof payload?.exp !== "number" || payload.exp < Date.now()) return null;
    return { tenantId: payload.tenantId };
  } catch {
    return null;
  }
}
