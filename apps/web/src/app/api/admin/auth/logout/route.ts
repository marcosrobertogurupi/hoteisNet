import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_SESSION_COOKIE, IMPERSONATION_COOKIE } from "@/lib/platformAuth";
import { SESSION_COOKIE } from "@/lib/auth";

// POST /api/admin/auth/logout — encerra a sessão do painel da plataforma. Limpa também um eventual
// SESSION_COOKIE / cookie de personificação, para não deixar uma sessão de assinante pendurada
// depois que a equipe sai do painel.
export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ success: true });
  for (const name of [PLATFORM_SESSION_COOKIE, IMPERSONATION_COOKIE, SESSION_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return res;
}
