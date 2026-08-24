import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

const DEFAULTS = {
  assignmentMode: "RECEPTION" as "RECEPTION" | "QUEUE",
};

// GET /api/tenant/housekeeping-settings — como os quartos são atribuídos às governantas do tenant
// da sessão: RECEPTION (a recepção/gestor atribui cada quarto manualmente) ou QUEUE (fila geral de
// quartos sujos, qualquer governanta pode assumir pelo app). Ver HousekeepingSetting no schema.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const settings = await prisma.housekeepingSetting.findUnique({ where: { tenantId: session.tenantId } });

    return NextResponse.json({
      success: true,
      settings: settings ? { assignmentMode: settings.assignmentMode } : DEFAULTS,
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/housekeeping-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar configurações de governança." },
      { status: 500 }
    );
  }
}

// PATCH /api/tenant/housekeeping-settings — cria/atualiza (upsert) o modo de atribuição.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId!;

    const body = await req.json();
    const { assignmentMode } = body;

    if (assignmentMode !== undefined && !["RECEPTION", "QUEUE"].includes(assignmentMode)) {
      return NextResponse.json({ success: false, error: "Modo de atribuição inválido." }, { status: 400 });
    }

    const data = assignmentMode !== undefined ? { assignmentMode } : {};

    await prisma.housekeepingSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: { tenantId: resolvedTenantId, ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/housekeeping-settings] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao salvar configurações de governança." },
      { status: 500 }
    );
  }
}
