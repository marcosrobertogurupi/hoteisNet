// Escapa texto livre antes de interpolar em template HTML (ex.: e-mails), para que um hóspede
// ou operador não consiga injetar markup/links (ex.: nome de hóspede cadastrado com HTML no
// pré-check-in público, depois interpolado sem escape num e-mail enviado pela recepção).
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Guarda mínima contra SSRF: recusa hosts SMTP que resolvem a endereços locais/privados óbvios.
// Não é uma proteção completa contra DNS rebinding, mas fecha o caso trivial de apontar o envio de
// e-mail (que faz uma conexão TCP crua a partir do servidor) para localhost ou uma faixa de rede
// interna.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
];

export function isBlockedSmtpHost(host: string): boolean {
  const clean = String(host || "").trim();
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(clean));
}
