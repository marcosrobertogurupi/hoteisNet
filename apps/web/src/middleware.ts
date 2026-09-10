import { NextRequest, NextResponse } from "next/server";
// Importa do núcleo leve (só `jose`, sem bcrypt/Prisma) — o middleware roda no Edge Runtime,
// que tem limite de 1 MB de bundle. Ver comentário em lib/sessionToken.ts.
import { verifySessionToken, isAdminRole, SESSION_COOKIE } from "@/lib/sessionToken";
import { verifyPlatformSessionToken, PLATFORM_SESSION_COOKIE } from "@/lib/platformAuth";
import { verifyHousekeeperSessionToken, HOUSEKEEPER_SESSION_COOKIE } from "@/lib/housekeeperAuth";
import { verifyStockCountSessionToken, STOCK_COUNT_SESSION_COOKIE } from "@/lib/stockCountAuth";

// Prefixos de rota liberados só para admin (Configurações, Usuários, Módulo Fiscal).
const ADMIN_ONLY_PREFIXES = ["/app/settings", "/app/cadastros/usuarios", "/app/fiscal"];

// Únicas rotas de API que não exigem sessão — autenticadas por outro meio (token de URL,
// segredo de webhook, token de caixa) ou são o próprio endpoint de login. Ver CLAUDE.md, regra 1.
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  // Login/logout do painel da plataforma (sessão própria, ver lib/platformAuth.ts).
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
  // Só devolve o build id da versão publicada e se ela é obrigatória — nenhum dado de tenant.
  // Consumida por abas ainda logadas e pela tela de login (aviso de versão desatualizada).
  "/api/version",
  "/api/housekeeping/login",
  "/api/housekeeping/logout",
  "/api/stock-count/login",
  "/api/stock-count/logout",
  "/api/uazapi/webhook/",
  // Webhook de pagamento do Asaas — autenticado por segredo próprio (ASAAS_WEBHOOK_SECRET),
  // comparado timing-safe na própria rota (CLAUDE.md §5), não por sessão.
  "/api/asaas/webhook/",
  "/api/public/",
  // Agente fiscal do PDV do restaurante: autentica com o token do caixa (Bearer), verificado
  // em lib/agentAuth.ts — cada rota /api/pdv/agente/* faz a própria checagem.
  "/api/pdv/agente/",
];

// Rotas de governança (app mobile da housekeeper) usam um cookie de sessão próprio,
// separado do login administrativo — ver lib/housekeeperAuth.ts.
const HOUSEKEEPER_API_PREFIX = "/api/housekeeping/";

// Rotas do app mobile de contagem de estoque — cookie de sessão próprio (Employee com login por
// telefone + senha), separado do login administrativo — ver lib/stockCountAuth.ts.
const STOCK_COUNT_API_PREFIX = "/api/stock-count/";

// Rotas que recebem POST de FORA do navegador (webhooks de provedor externo e o agente fiscal do
// caixa) e por isso não podem passar pela checagem de Origin abaixo. Todas são autenticadas por
// segredo/token próprio na própria rota, nunca por cookie — logo não são alvo de CSRF.
const CSRF_EXEMPT_PREFIXES = ["/api/uazapi/webhook/", "/api/asaas/webhook/", "/api/pdv/agente/"];

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Defesa em profundidade contra CSRF. A proteção real do projeto é o `SameSite=Lax` dos cookies de
// sessão, que já barra o caso clássico (um site de terceiro dispara POST com o cookie do usuário).
// Esta checagem cobre o resto: quando o navegador manda `Origin` — e ele SEMPRE manda em requisição
// que altera estado —, a origem precisa ser a própria aplicação. Requisição sem `Origin` não vem de
// navegador (curl, agente fiscal, healthcheck) e segue para a autenticação normal da rota.
function isCrossOriginStateChange(req: NextRequest): boolean {
  if (!STATE_CHANGING_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== req.nextUrl.origin;
  } catch {
    return true; // Origin malformada: trata como cross-origin.
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (!CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) && isCrossOriginStateChange(req)) {
      return NextResponse.json({ success: false, error: "Origem da requisição não autorizada." }, { status: 403 });
    }

    if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next();
    }

    // Painel da plataforma: cookie de sessão PRÓPRIO (não o SESSION_COOKIE do app do assinante).
    // A checagem fina view-vs-edit (requirePlatformRole / requirePlatformAdmin) fica em cada
    // route.ts — isto é só a primeira barreira. NÃO existe rede de segurança automática.
    if (pathname.startsWith("/api/admin/")) {
      const platformToken = req.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
      const platformSession = platformToken ? await verifyPlatformSessionToken(platformToken) : null;
      if (platformSession) return NextResponse.next();
      return NextResponse.json({ success: false, error: "Sessão da plataforma inválida ou expirada." }, { status: 401 });
    }

    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
    const session = sessionToken ? await verifySessionToken(sessionToken) : null;
    if (session) return NextResponse.next();

    if (pathname.startsWith(HOUSEKEEPER_API_PREFIX)) {
      const housekeeperToken = req.cookies.get(HOUSEKEEPER_SESSION_COOKIE)?.value;
      const housekeeperSession = housekeeperToken ? await verifyHousekeeperSessionToken(housekeeperToken) : null;
      if (housekeeperSession) return NextResponse.next();
    }

    if (pathname.startsWith(STOCK_COUNT_API_PREFIX)) {
      const stockCountToken = req.cookies.get(STOCK_COUNT_SESSION_COOKIE)?.value;
      const stockCountSession = stockCountToken ? await verifyStockCountSessionToken(stockCountToken) : null;
      if (stockCountSession) return NextResponse.next();
    }

    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  // --- Páginas do painel da plataforma (/admin/**) — sessão própria, login em /admin/login ---
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const platformToken = req.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
    const platformSession = platformToken ? await verifyPlatformSessionToken(platformToken) : null;
    if (!platformSession) {
      const loginUrl = new URL("/admin/login", req.url);
      if (pathname !== "/admin") loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // --- Páginas do app do assinante (/app/**) ---
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminOnlyPath = ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isAdminOnlyPath && !isAdminRole(session.role)) {
    const appUrl = new URL("/app", req.url);
    appUrl.searchParams.set("acesso_negado", "1");
    return NextResponse.redirect(appUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/api/:path*"],
};
