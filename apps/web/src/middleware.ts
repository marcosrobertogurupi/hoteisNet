import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, isAdminRole, SESSION_COOKIE } from "@/lib/auth";

// Prefixos de rota liberados só para admin (Configurações, Usuários, Módulo Fiscal).
const ADMIN_ONLY_PREFIXES = ["/app/settings", "/app/cadastros/usuarios", "/app/fiscal"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
  matcher: ["/app/:path*", "/admin/:path*"],
};
