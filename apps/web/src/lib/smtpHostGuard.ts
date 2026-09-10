import { lookup } from "node:dns/promises";
import net from "node:net";

// Guarda contra SSRF nos envios de e-mail: a conexão SMTP é um socket TCP cru aberto PELO
// SERVIDOR, então um host escolhido por quem chama a API viraria uma porta para varrer/alcançar a
// rede interna. Recusa hosts que apontem para endereços locais, privados ou de metadados de nuvem.
//
// A checagem por padrão textual (abaixo) fecha só o caso trivial de digitar o IP literal: um nome
// DNS comum que RESOLVE para 127.0.0.1 ou 169.254.169.254 passava direto. Por isso a versão
// assíncrona resolve o nome e valida os endereços de verdade — é ela que as rotas devem usar.
// (Isto não elimina DNS rebinding, em que o nome resolve para um IP público na checagem e para um
// interno na conexão; para isso seria preciso fixar o IP validado no socket.)

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
];

function stripBrackets(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "");
}

function isBlockedIp(ip: string): boolean {
  const clean = stripBrackets(ip);

  if (net.isIPv4(clean)) {
    const [a, b] = clean.split(".").map(Number);
    if (a === 0 || a === 127) return true; // este host / loopback
    if (a === 10) return true; // privado
    if (a === 172 && b >= 16 && b <= 31) return true; // privado
    if (a === 192 && b === 168) return true; // privado
    if (a === 169 && b === 254) return true; // link-local, inclui o endpoint de metadados de nuvem
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
    if (a >= 224) return true; // multicast e reservado
    return false;
  }

  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (/^f[cd]/.test(lower)) return true; // unique local (fc00::/7)
    // IPv4 mapeado em IPv6 (::ffff:127.0.0.1)
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }

  return false;
}

/** Checagem textual, sem DNS — fecha só o caso do IP/nome literal. */
export function isBlockedSmtpHost(host: string): boolean {
  const clean = String(host || "").trim();
  if (!clean) return true;
  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(clean))) return true;
  return isBlockedIp(clean);
}

/**
 * Checagem completa: aplica a textual e, quando o host é um nome, resolve o DNS e recusa se
 * QUALQUER endereço retornado for local/privado. Falha de resolução também bloqueia — um host que
 * não resolve não tem por que receber uma conexão SMTP nossa.
 */
export async function isBlockedSmtpHostResolved(host: string): Promise<boolean> {
  const clean = String(host || "").trim();
  if (isBlockedSmtpHost(clean)) return true;

  const bare = stripBrackets(clean);
  if (net.isIP(bare)) return false; // já validado acima como IP literal permitido

  try {
    const addresses = await lookup(bare, { all: true });
    if (addresses.length === 0) return true;
    return addresses.some((entry) => isBlockedIp(entry.address));
  } catch {
    return true;
  }
}
