import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

// POST /api/tenant/housekeeping-tasks/reopen — a recepção devolve à fila a arrumação de hoje de um
// quarto ocupado que a governanta havia marcado como "não perturbe" (ex.: o hóspede tirou o aviso
// e liberou a arrumação). Reabre o registro SKIPPED de hoje como PENDING, sem dono.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const body = await req.json().catch(() => ({}));
    const { roomId } = body;
    if (!roomId) {
      return NextResponse.json({ success: false, error: "Quarto não informado." }, { status: 400 });
    }

    const room = await prisma.room.findFirst({ where: { id: roomId, tenantId: resolvedTenantId } });
    if (!room) {
      return NextResponse.json({ success: false, error: "Quarto não encontrado." }, { status: 404 });
    }
    if (room.status !== "OCCUPIED") {
      return NextResponse.json(
        { success: false, error: "Só faz sentido em quarto ocupado." },
        { status: 400 }
      );
    }

    const today = dateOnlyBrasilia(new Date());

    const skipped = await prisma.housekeepingTask.findFirst({
      where: {
        tenantId: resolvedTenantId,
        roomId,
        type: "OCCUPIED",
        serviceDate: today,
        status: "SKIPPED",
      },
    });

    if (skipped) {
      const reopened = await prisma.housekeepingTask.updateMany({
        where: { id: skipped.id, tenantId: resolvedTenantId, status: "SKIPPED" },
        data: {
          status: "PENDING",
          skipReason: null,
          housekeeperId: null,
          finishedAt: null,
          notes: null,
        },
      });
      if (reopened.count === 0) {
        return NextResponse.json(
          { success: false, error: "A arrumação de hoje já foi retomada ou concluída." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    // Sem registro de "não perturbe" hoje — cria a arrumação do dia direto (idempotente pelo unique).
    try {
      await prisma.housekeepingTask.create({
        data: {
          tenantId: resolvedTenantId,
          roomId,
          type: "OCCUPIED",
          status: "PENDING",
          serviceDate: today,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return NextResponse.json({ success: true });
      }
      throw e;
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/tenant/housekeeping-tasks/reopen] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao devolver o quarto à fila." },
      { status: 500 }
    );
  }
}
