import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";

// PATCH /api/housekeeping/tasks/[id] — a governanta atualiza a observação da limpeza em
// andamento (ex.: "Hóspede fumou no quarto", "Faltando uma toalha").
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const { notes } = body;

    const task = await prisma.housekeepingTask.findFirst({
      where: { id, tenantId: session.tenantId, housekeeperId: session.housekeeperId },
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Limpeza não encontrada." }, { status: 404 });
    }
    if (task.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, error: "Só é possível editar a observação de uma limpeza em andamento." },
        { status: 409 }
      );
    }

    const updated = await prisma.housekeepingTask.update({
      where: { id },
      data: { notes: typeof notes === "string" ? notes : null },
    });

    return NextResponse.json({ success: true, task: updated });
  } catch (error: any) {
    console.error("[PATCH /api/housekeeping/tasks/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao salvar observação." },
      { status: 500 }
    );
  }
}
