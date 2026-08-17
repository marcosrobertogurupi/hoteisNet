import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { verifyPassword, isAdminRole, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/auth/verify-admin — autorização pontual ("step-up"): confirma que e-mail+senha
// pertencem a um usuário ADMIN/SUPER_ADMIN ativo, sem abrir sessão nem trocar o operador
// logado no terminal. Usado para liberar ações sensíveis (ex: cortesia de check-in de
// madrugada) que exigem aprovação de um administrador, mantendo o registro de quem autorizou.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, reason } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "E-mail e senha são obrigatórios." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });

    if (!user || !user.active) {
      return NextResponse.json({ success: false, error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ success: false, error: "E-mail ou senha inválidos." }, { status: 401 });
    }

    if (!isAdminRole(user.role)) {
      return NextResponse.json({ success: false, error: "Este usuário não possui permissão de administrador." }, { status: 403 });
    }

    const tenantId = user.tenantId || DEFAULT_TENANT_ID;

    await logActivity({
      tenantId,
      userId: user.id,
      userName: user.name,
      action: "ADMIN_STEP_UP_AUTH",
      description: `${user.name} autorizou com senha de administrador: ${reason || "ação sensível"}.`,
      entityType: "AUTH",
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      admin: { id: user.id, name: user.name, role: user.role },
    });
  } catch (error: any) {
    console.error("[POST /api/auth/verify-admin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autorizar." }, { status: 500 });
  }
}
