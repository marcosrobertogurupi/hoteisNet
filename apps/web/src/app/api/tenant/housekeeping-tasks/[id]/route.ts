import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// DELETE /api/tenant/housekeeping-tasks/[id] — cancela uma atribuição ainda não iniciada
// (só permitido em status PENDING; uma limpeza IN_PROGRESS não pode ser cancelada por aqui).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const task = await prisma.housekeepingTask.findFirst({ where: { id, tenantId: session.tenantId } });
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
