import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";

// POST /api/housekeeping/rooms/[roomId]/start — a governanta inicia a limpeza de um quarto.
//  - Tarefa OCCUPIED (arrumação com hóspede) ou CHECKOUT no modo RECEPTION: precisa existir uma
//    tarefa PENDING já atribuída a ela para esse quarto — nunca é criada na hora.
//  - CHECKOUT no modo QUEUE, sem tarefa prévia: cria a tarefa na hora (quem clicar primeiro
//    "assume" o quarto).
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { roomId } = await params;

    const room = await prisma.room.findFirst({ where: { id: roomId, tenantId: session.tenantId, active: true } });
    if (!room) {
      return NextResponse.json({ success: false, error: "Quarto não encontrado." }, { status: 404 });
    }

    // Uma governanta só pode ter uma limpeza IN_PROGRESS por vez — impede iniciar um segundo
    // quarto sem antes concluir (ou ter cancelada) o que já está em andamento.
    const ongoingElsewhere = await prisma.housekeepingTask.findFirst({
      where: { tenantId: session.tenantId, housekeeperId: session.housekeeperId, status: "IN_PROGRESS", roomId: { not: roomId } },
      include: { room: { select: { number: true } } },
    });
    if (ongoingElsewhere) {
      return NextResponse.json(
        { success: false, error: `Você já está limpando o quarto ${ongoingElsewhere.room.number}. Conclua antes de iniciar outro.` },
        { status: 409 }
      );
    }

    const existing = await prisma.housekeepingTask.findFirst({
      where: { tenantId: session.tenantId, roomId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });

    if (existing) {
      if (existing.housekeeperId !== session.housekeeperId) {
        if (existing.status === "IN_PROGRESS") {
          return NextResponse.json(
            { success: false, error: "Este quarto já foi assumido por outra governanta." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { success: false, error: "Este quarto não está atribuído a você." },
          { status: 403 }
        );
      }
      if (existing.status === "IN_PROGRESS") {
        return NextResponse.json({ success: true, task: existing });
      }
      const task = await prisma.housekeepingTask.update({
        where: { id: existing.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      return NextResponse.json({ success: true, task });
    }

    // Sem tarefa prévia — só é permitido criar na hora quando o assinante está no modo QUEUE
    // (fila espontânea de limpeza pós check-out; arrumação com hóspede nunca é espontânea).
    const setting = await prisma.housekeepingSetting.findUnique({ where: { tenantId: session.tenantId } });
    const assignmentMode = setting?.assignmentMode || "RECEPTION";
    if (assignmentMode !== "QUEUE") {
      return NextResponse.json(
        { success: false, error: "Este quarto não está atribuído a você." },
        { status: 403 }
      );
    }

    const task = await prisma.housekeepingTask.create({
      data: {
        tenantId: session.tenantId,
        roomId,
        housekeeperId: session.housekeeperId,
        type: "CHECKOUT",
        status: "IN_PROGRESS",
        assignedAt: new Date(),
        startedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    console.error("[POST /api/housekeeping/rooms/[roomId]/start] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao iniciar limpeza." },
      { status: 500 }
    );
  }
}
