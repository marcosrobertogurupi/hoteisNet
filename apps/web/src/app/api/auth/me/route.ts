import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isAdminRole } from "@/lib/auth";

// GET /api/auth/me — devolve o usuário da sessão atual, para o client montar a UI (nome real
// na sidebar, liberar/bloquear telas por papel, etc.).
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      tenantId: session.tenantId,
      isAdmin: isAdminRole(session.role),
    },
  });
}
