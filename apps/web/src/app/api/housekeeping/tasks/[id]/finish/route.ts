import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";

// POST /api/housekeeping/tasks/[id]/finish — a governanta avisa que o quarto está limpo.
// Calcula a duração da limpeza. Só libera o quarto como VACANT_CLEAN quando é uma tarefa CHECKOUT
// (limpeza profunda pós check-out) — uma tarefa OCCUPIED (arrumação com hóspede) nunca mexe no
// status do quarto, que continua OCCUPIED. Em ambos os casos, o selo visual de "em limpeza" no
// Mapa de Quartos some neste momento (deriva da tarefa, não do status do quarto).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { notes } = body;

    const task = await prisma.housekeepingTask.findFirst({
      where: { id, tenantId: session.tenantId, housekeeperId: session.housekeeperId },
      include: { room: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Limpeza não encontrada." }, { status: 404 });
    }
    if (task.status !== "IN_PROGRESS" || !task.startedAt) {
      return NextResponse.json(
        { success: false, error: "Esta limpeza não está em andamento." },
        { status: 409 }
      );
    }

    const finishedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((finishedAt.getTime() - task.startedAt.getTime()) / 1000));

    const [updatedTask] = await prisma.$transaction([
      prisma.housekeepingTask.update({
        where: { id },
        data: {
          status: "DONE",
          finishedAt,
          durationSeconds,
          notes: typeof notes === "string" ? notes : task.notes,
        },
      }),
      ...(task.type === "CHECKOUT" && task.room.status === "VACANT_DIRTY"
        ? [prisma.room.update({ where: { id: task.roomId }, data: { status: "VACANT_CLEAN" } })]
        : []),
    ]);

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error: any) {
    console.error("[POST /api/housekeeping/tasks/[id]/finish] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao concluir limpeza." },
      { status: 500 }
    );
  }
}
