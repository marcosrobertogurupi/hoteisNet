// Identificador da versão publicada. Derivado do commit do deploy (Vercel expõe
// VERCEL_GIT_COMMIT_SHA no build); em dev local cai para um carimbo de tempo estável durante a
// vida do processo. Fica "assado" no bundle do cliente via `env` abaixo (NEXT_PUBLIC_BUILD_ID) e é
// comparado, pelo componente AppVersionGate, com o que GET /api/version responde em tempo real —
// quando divergem, há uma nova versão no ar e a aba atual está desatualizada.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || `dev-${Date.now()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  generateBuildId: () => BUILD_ID,
  async headers() {
    const baseSecurityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
