import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName, SESSION_COOKIE } from "@/lib/auth";

// POST /api/auth/logout — encerra a sessão (limpa o cookie httpOnly) e registra na auditoria.
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });

  if (session) {
    await logActivity({
      tenantId: session.tenantId || "tenant-hoteisnet-demo",
      userId: session.userId,
      userName: session.name,
      action: "LOGOUT",
      description: `${session.name} saiu do sistema.`,
      entityType: "AUTH",
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });
  }

  return res;
}
