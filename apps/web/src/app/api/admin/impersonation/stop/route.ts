import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, SESSION_COOKIE } from "@/lib/auth";
import { IMPERSONATION_COOKIE, getImpersonation } from "@/lib/platformAuth";
import { logPlatformAction } from "@/lib/platformAudit";

// POST /api/admin/impersonation/stop — "sair da personificação". Limpa a sessão de assinante e o
// marcador; a sessão do painel (PLATFORM_SESSION_COOKIE) segue intacta, então o client volta para
// /admin. Exige sessão de plataforma (é a equipe encerrando o próprio acesso emprestado).
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Sessão da plataforma inválida ou expirada." }, { status: 401 });
  }

  const impersonation = await getImpersonation(req);

  const res = NextResponse.json({ success: true, redirectTo: "/admin/tenants" });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(IMPERSONATION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });

  if (impersonation) {
    await logPlatformAction({
      req,
      session,
      action: "TENANT_IMPERSONATE_STOP",
      description: `${session.name} saiu da personificação do assinante ${impersonation.tenantName}.`,
      targetTenantId: impersonation.tenantId,
      entityType: "Tenant",
      entityId: impersonation.tenantId,
    });
  }

  return res;
}
