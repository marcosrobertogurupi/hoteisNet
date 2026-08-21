import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// DELETE /api/tenant/housekeeping-tasks/[id] — cancela uma atribuição ainda não iniciada
// (só permitido em status PENDING; uma limpeza IN_PROGRESS não pode ser cancelada por aqui).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const task = await prisma.housekeepingTask.findFirst({ where: { id, tenantId: resolvedTenantId } });
    if (!task) {
      return NextResponse.json({ success: false, error: "Atribuição não encontrada." }, { status: 404 });
    }
    if (task.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Só é possível cancelar atribuições que ainda não foram iniciadas." },
        { status: 409 }
      );
    }

    await prisma.housekeepingTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/tenant/housekeeping-tasks/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao cancelar atribuição." },
      { status: 500 }
    );
  }
}
