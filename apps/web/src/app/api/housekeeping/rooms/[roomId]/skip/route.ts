import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

// POST /api/housekeeping/rooms/[roomId]/skip — a governanta chega à porta de um quarto ocupado,
// vê o aviso de "não perturbe" e registra isso no próprio app. Encerra a arrumação do dia sem
// limpeza (status SKIPPED, skipReason DO_NOT_DISTURB); o status do quarto continua OCCUPIED. O
// registro entra no histórico da hospedagem, ao lado das limpezas (ver room-cleaning-history).
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

    const room = await prisma.room.findFirst({
      where: { id: roomId, tenantId: session.tenantId, active: true },
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
      await ensureDailyArrumacaoTasks(session.tenantId);
    } catch (e) {
      console.error("[POST /api/housekeeping/rooms/[roomId]/skip] ensureDailyArrumacaoTasks falhou:", e);
    }

    const today = dateOnlyBrasilia(new Date());

    const resolvedToday = await prisma.housekeepingTask.findFirst({
      where: {
        tenantId: session.tenantId,
        roomId,
        type: "OCCUPIED",
        serviceDate: today,
        status: { in: ["DONE", "SKIPPED"] },
      },
    });
    if (resolvedToday) {
      return NextResponse.json(
        { success: false, error: "A arrumação de hoje deste quarto já foi resolvida." },
        { status: 409 }
      );
    }

    const active = await prisma.housekeepingTask.findFirst({
      where: {
        tenantId: session.tenantId,
        roomId,
        type: "OCCUPIED",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (active) {
      if (active.housekeeperId && active.housekeeperId !== session.housekeeperId) {
        return active.status === "IN_PROGRESS"
          ? NextResponse.json(
              { success: false, error: "Este quarto já foi assumido por outra governanta." },
              { status: 409 }
            )
          : NextResponse.json(
              { success: false, error: "Este quarto não está atribuído a você." },
              { status: 403 }
            );
      }
      const updated = await prisma.housekeepingTask.updateMany({
        where: { id: active.id, tenantId: session.tenantId, status: { in: ["PENDING", "IN_PROGRESS"] } },
        data: {
          status: "SKIPPED",
          skipReason: "DO_NOT_DISTURB",
          housekeeperId: session.housekeeperId,
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

    // Sem tarefa ativa (ex.: dia do check-in no modo QUEUE, em que a arrumação automática é pulada,
    // mas a governanta passou e viu o aviso) — cria o registro já como SKIPPED.
    try {
      await prisma.housekeepingTask.create({
        data: {
          tenantId: session.tenantId,
          roomId,
          housekeeperId: session.housekeeperId,
          type: "OCCUPIED",
          status: "SKIPPED",
          skipReason: "DO_NOT_DISTURB",
          serviceDate: today,
          finishedAt: new Date(),
          notes: note || null,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return NextResponse.json(
          { success: false, error: "A arrumação de hoje deste quarto já foi resolvida." },
          { status: 409 }
        );
      }
      throw e;
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/housekeeping/rooms/[roomId]/skip] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao registrar \"não perturbe\"." },
      { status: 500 }
    );
  }
}
