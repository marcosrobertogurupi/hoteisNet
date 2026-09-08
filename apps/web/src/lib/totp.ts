import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// TOTP (RFC 6238) sem dependência externa. Usado no 2FA do login do painel da plataforma.
// SHA-1, 6 dígitos, passo de 30s — o padrão que Google Authenticator / Authy / 1Password aceitam.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

// Aceita o código do passo atual e de ±`window` passos (tolerância a relógio dessincronizado).
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const code = String(token || "").replace(/\D/g, "");
  if (code.length !== 6) return false;
  const key = base32Decode(secret);
  if (key.length === 0) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(key, step + w);
    if (expected.length === code.length && timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
  }
  return false;
}

export function totpUri(secret: string, accountLabel: string, issuer = "Hoteis.Net Painel"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
