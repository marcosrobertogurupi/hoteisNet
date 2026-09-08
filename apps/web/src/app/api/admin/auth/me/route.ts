import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession } from "@/lib/auth";
import { getImpersonation, isPlatformEditRole } from "@/lib/platformAuth";

// GET /api/admin/auth/me — usuário da sessão do painel, para o client montar a UI (nome na
// sidebar, liberar/bloquear edição por papel) e saber se há uma personificação ativa.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const impersonation = await getImpersonation(req);

  return NextResponse.json({
    success: true,
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role,
      canEdit: isPlatformEditRole(session.role),
    },
    impersonating: impersonation
      ? { tenantId: impersonation.tenantId, tenantName: impersonation.tenantName }
      : null,
  });
}
