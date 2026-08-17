// Resolução de terminal (Node runtime only — usa `dns`, por isso fica separado de lib/auth.ts,
// que também é importado pelo middleware.ts em Edge runtime e não pode depender de módulos Node).
import { promises as dns } from "dns";

// Tenta resolver um hostname a partir do IP via DNS reverso (só funciona em redes que expõem
// isso, ex.: LAN corporativa); se falhar ou expirar, cai no próprio IP como identificador.
export async function resolveTerminalLabel(ip: string): Promise<string> {
  if (!ip || ip === "desconhecido") return "desconhecido";
  // IPv6 loopback / localhost em dev
  const normalizedIp = ip === "::1" ? "127.0.0.1" : ip;

  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 800));
    const hostnames = await Promise.race([dns.reverse(normalizedIp), timeout]);
    if (hostnames && hostnames.length > 0) {
      return `${hostnames[0]} (${ip})`;
    }
  } catch {
    // Sem PTR configurado, rede sem suporte, ou timeout — segue com o IP puro.
  }
  return ip;
}
