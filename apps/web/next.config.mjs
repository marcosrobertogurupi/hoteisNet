/** @type {import('next').NextConfig} */

// Content-Security-Policy — publicada primeiro em modo REPORT-ONLY (ver CSP_ENFORCE abaixo).
//
// Sem CSP não existe segunda linha de defesa contra XSS. O plano é o recomendado pela auditoria de
// 09/09/2026: subir em Report-Only, medir o que o console reporta como violação em uso real, ajustar
// as origens e só então promover a bloqueante definindo CSP_ENFORCE=true no ambiente.
//
// Observações sobre as diretivas mais frouxas, que são as candidatas naturais a apertar depois:
//  - script-src usa 'unsafe-inline'/'unsafe-eval' porque o Next injeta scripts inline de hidratação;
//    apertar isso exige migrar para nonce por requisição (middleware), o que é um passo à parte.
//  - style-src usa 'unsafe-inline' porque a UI é toda Tailwind + estilos inline nos componentes.
//  - img-src aceita https: e data: porque a foto de perfil do hóspede vem da CDN do WhatsApp
//    (domínio que varia por instância uazapi) e o logo do hotel é gravado como data URI.
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^https:/, "wss:");

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}`.trim(),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .filter(Boolean)
  .join("; ");

// Só vira bloqueante quando o ambiente pedir explicitamente — nunca por padrão, para que uma
// diretiva esquecida não derrube a operação de um hotel em produção.
const CSP_HEADER_KEY =
  process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

const nextConfig = {
  async headers() {
    const baseSecurityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: CSP_HEADER_KEY, value: CSP_DIRECTIVES },
    ];
    return [
      {
        // App de contagem de estoque: precisa da câmera (leitor de código de barras) na própria
        // origem. As demais permissões continuam bloqueadas.
        source: "/contagem/:path*",
        headers: [
          ...baseSecurityHeaders,
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        // Todo o resto: câmera bloqueada (o negative-lookahead evita duas diretivas conflitantes
        // na mesma resposta para /contagem/*).
        source: "/((?!contagem(?:/|$)).*)",
        headers: [
          ...baseSecurityHeaders,
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
