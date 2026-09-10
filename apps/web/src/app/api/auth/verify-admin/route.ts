import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { verifyAdminStepUp } from "@/lib/adminAuth";

// POST /api/auth/verify-admin — autorização pontual ("step-up"): confirma que e-mail+senha
// pertencem a um usuário ADMIN/SUPER_ADMIN ativo DO MESMO HOTEL da sessão, sem abrir sessão nem
// trocar o operador logado no terminal. Usado para liberar ações sensíveis (ex: cortesia de
// check-in de madrugada) que exigem aprovação de um administrador, mantendo o registro de quem
// autorizou.
//
// Exige uma sessão já autenticada (qualquer usuário do terminal) — não é um endpoint público,
// para não virar um segundo oráculo de força-bruta contra credenciais de administrador.
//
// Até 09/09/2026 esta rota buscava o usuário só por e-mail, sem filtro de tenant: um operador do
// Hotel A que soubesse e-mail e senha de um administrador do Hotel B recebia success:true, e a
// ausência de rate limit permitia testar credenciais de administradores de qualquer assinante.
// A verificação agora é delegada a verifyAdminStepUp, que consulta o usuário já filtrado por
// session.tenantId (CLAUDE.md, Segurança §2 e §8).
export async function POST(req: NextRequest) {
  try {
    const callerSession = await getSessionUser(req);
    if (!callerSession?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { email, password, reason } = body;

    const result = await verifyAdminStepUp(req, email, password, callerSession.tenantId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await logActivity({
      tenantId: callerSession.tenantId,
      userId: result.admin.id,
      userName: result.admin.name,
      action: "ADMIN_STEP_UP_AUTH",
      description: `${result.admin.name} autorizou com senha de administrador: ${reason || "ação sensível"}.`,
      entityType: "AUTH",
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, admin: result.admin });
  } catch (error: any) {
    console.error("[POST /api/auth/verify-admin] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao autorizar." }, { status: 500 });
  }
}
