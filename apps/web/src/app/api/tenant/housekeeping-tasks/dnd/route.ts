import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

// POST /api/tenant/housekeeping-tasks/dnd — a recepção marca um quarto ocupado como "não perturbe"
// hoje, tirando-o da relação de limpeza da governanta. Encerra a arrumação do dia sem limpeza
// (status SKIPPED, skipReason DO_NOT_DISTURB); o status do quarto continua OCCUPIED. Para retirar o
// "não perturbe" e devolver o quarto à fila, use POST /api/tenant/housekeeping-tasks/reopen.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const body = await req.json().catch(() => ({}));
    const roomId = typeof body.roomId === "string" ? body.roomId : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!roomId) {
      return NextResponse.json({ success: false, error: "Quarto não informado." }, { status: 400 });
    }

    const room = await prisma.room.findFirst({
      where: { id: roomId, tenantId, active: true },
      select: { id: true, status: true },
    });
    if (!room) {
      return NextResponse.json({ success: false, error: "Quarto não encontrado." }, { status: 404 });
    }
    if (room.status !== "OCCUPIED") {
      return NextResponse.json(
        { success: false, error: "\"Não perturbe\" só se aplica a quarto com hóspede hospedado." },
        { status: 400 }
      );
    }

    try {
      await ensureDailyArrumacaoTasks(tenantId);
    } catch (e) {
      console.error("[POST /api/tenant/housekeeping-tasks/dnd] ensureDailyArrumacaoTasks falhou:", e);
    }

    const today = dateOnlyBrasilia(new Date());

    const resolvedToday = await prisma.housekeepingTask.findFirst({
      where: { tenantId, roomId, type: "OCCUPIED", serviceDate: today, status: { in: ["DONE", "SKIPPED"] } },
      select: { id: true, status: true },
    });
    if (resolvedToday) {
      return resolvedToday.status === "SKIPPED"
        ? NextResponse.json({ success: true })
        : NextResponse.json(
            { success: false, error: "A arrumação de hoje deste quarto já foi concluída." },
            { status: 409 }
          );
    }

    const active = await prisma.housekeepingTask.findFirst({
      where: { tenantId, roomId, type: "OCCUPIED", status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (active) {
      const updated = await prisma.housekeepingTask.updateMany({
        where: { id: active.id, tenantId, status: { in: ["PENDING", "IN_PROGRESS"] } },
        data: {
          status: "SKIPPED",
          skipReason: "DO_NOT_DISTURB",
          housekeeperId: null,
          finishedAt: new Date(),
          durationSeconds: null,
          notes: note || null,
        },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: "A arrumação de hoje deste quarto já foi resolvida." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    // Sem tarefa ativa (ex.: dia do check-in, em que a arrumação automática é pulada) — cria o
    // registro já como SKIPPED.
    try {
      await prisma.housekeepingTask.create({
        data: {
          tenantId,
          roomId,
          type: "OCCUPIED",
          status: "SKIPPED",
          skipReason: "DO_NOT_DISTURB",
          serviceDate: today,
          finishedAt: new Date(),
          notes: note || null,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") return NextResponse.json({ success: true });
      throw e;
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/tenant/housekeeping-tasks/dnd] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao marcar \"não perturbe\"." },
      { status: 500 }
    );
  }
}
