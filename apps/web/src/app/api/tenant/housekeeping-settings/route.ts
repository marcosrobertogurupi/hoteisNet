import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

const DEFAULTS = {
  assignmentMode: "RECEPTION" as "RECEPTION" | "QUEUE",
};

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/housekeeping-settings?tenantId=... — como os quartos são atribuídos às
// governantas: RECEPTION (a recepção/gestor atribui cada quarto manualmente) ou QUEUE (fila geral
// de quartos sujos, qualquer governanta pode assumir pelo app). Ver HousekeepingSetting no schema.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const settings = await prisma.housekeepingSetting.findUnique({ where: { tenantId: resolvedTenantId } });

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
    const body = await req.json();
    const { tenantId, assignmentMode } = body;

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

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
