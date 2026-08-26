import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

// POST /api/housekeeping/rooms/[roomId]/start — a governanta inicia a limpeza de um quarto.
//  - Já existe uma tarefa PENDING (atribuída pela recepção ou a arrumação do dia no modo QUEUE):
//    apenas transiciona para IN_PROGRESS.
//  - Sem tarefa prévia, só no modo QUEUE: cria a tarefa na hora (quem clicar primeiro assume). O
//    tipo vem da situação do quarto — OCCUPIED (com serviceDate do dia) para quarto ocupado,
//    CHECKOUT para quarto vago aguardando higienização.
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { roomId } = await params;

    try {
      await ensureDailyArrumacaoTasks(session.tenantId);
    } catch (e) {
      console.error("[POST /api/housekeeping/rooms/[roomId]/start] ensureDailyArrumacaoTasks falhou:", e);
    }

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
      if (existing.housekeeperId && existing.housekeeperId !== session.housekeeperId) {
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
      // Assume a tarefa PENDING com a trava do status na própria escrita — se duas governantas
      // clicarem juntas, só a primeira transiciona e a segunda recebe 409.
      const claimed = await prisma.housekeepingTask.updateMany({
        where: { id: existing.id, tenantId: session.tenantId, status: "PENDING" },
        data: { status: "IN_PROGRESS", startedAt: new Date(), housekeeperId: session.housekeeperId },
      });
      if (claimed.count === 0) {
        return NextResponse.json(
          { success: false, error: "Este quarto já foi assumido por outra governanta." },
          { status: 409 }
        );
      }
      const task = await prisma.housekeepingTask.findUnique({ where: { id: existing.id } });
      return NextResponse.json({ success: true, task });
    }

    // Sem tarefa prévia — só é permitido criar na hora no modo QUEUE (fila espontânea).
    const setting = await prisma.housekeepingSetting.findUnique({ where: { tenantId: session.tenantId } });
    const assignmentMode = setting?.assignmentMode || "RECEPTION";
    if (assignmentMode !== "QUEUE") {
      return NextResponse.json(
        { success: false, error: "Este quarto não está atribuído a você." },
        { status: 403 }
      );
    }

    const isOccupied = room.status === "OCCUPIED";

    if (isOccupied) {
      // A arrumação de hoje deste quarto já pode ter sido concluída ou marcada como "não perturbe".
      const resolvedToday = await prisma.housekeepingTask.findFirst({
        where: {
          tenantId: session.tenantId,
          roomId,
          type: "OCCUPIED",
          serviceDate: dateOnlyBrasilia(new Date()),
          status: { in: ["DONE", "SKIPPED"] },
        },
      });
      if (resolvedToday) {
        return NextResponse.json(
          { success: false, error: "A arrumação de hoje deste quarto já foi resolvida." },
          { status: 409 }
        );
      }
    }

    let task;
    try {
      task = await prisma.housekeepingTask.create({
        data: {
          tenantId: session.tenantId,
          roomId,
          housekeeperId: session.housekeeperId,
          type: isOccupied ? "OCCUPIED" : "CHECKOUT",
          status: "IN_PROGRESS",
          serviceDate: isOccupied ? dateOnlyBrasilia(new Date()) : null,
          assignedAt: new Date(),
          startedAt: new Date(),
        },
      });
    } catch (e: any) {
      // Corrida com a geração diária / outra governanta que acabou de assumir o mesmo quarto.
      if (e?.code === "P2002") {
        return NextResponse.json(
          { success: false, error: "Este quarto acabou de ser assumido — atualize a lista." },
          { status: 409 }
        );
      }
      throw e;
    }
    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    console.error("[POST /api/housekeeping/rooms/[roomId]/start] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao iniciar limpeza." },
      { status: 500 }
    );
  }
}
