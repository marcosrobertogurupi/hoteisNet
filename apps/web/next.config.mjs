/** @type {import('next').NextConfig} */
const nextConfig = {
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
