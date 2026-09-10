import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperUser } from "@/lib/housekeeperSession";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { applyMinibarCheck } from "@/lib/minibarCheck";
import { logActivity } from "@/lib/audit";

// POST /api/housekeeping/tasks/[id]/finish — a governanta avisa que o quarto está limpo.
// Calcula a duração da limpeza. Só libera o quarto como VACANT_CLEAN quando é uma tarefa CHECKOUT
// (limpeza profunda pós check-out) — uma tarefa OCCUPIED (arrumação com hóspede) nunca mexe no
// status do quarto, que continua OCCUPIED. Em ambos os casos, o selo visual de "em limpeza" no
// Mapa de Quartos some neste momento (deriva da tarefa, não do status do quarto).
//
// Quarto abastecido (frigobar): numa arrumação com hóspede (tarefa OCCUPIED) de um quarto cuja
// categoria tem kit cadastrado e com o recurso ligado no tenant, a governanta informa a quantidade
// ENCONTRADA de cada item do kit (`minibarFound`). O que foi consumido vira lançamento de consumo
// no quarto e baixa o estoque do PDV do frigobar (ver lib/minibarCheck.ts). Assume-se que o
// frigobar é reabastecido ao kit cheio logo após a arrumação.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getHousekeeperUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { notes } = body;
    const minibarFound: { productId: string; foundQty: number }[] = Array.isArray(body?.minibarFound)
      ? body.minibarFound
      : [];

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

    // Conferência do frigobar — só em arrumação com hóspede (OCCUPIED). Descobrimos se ela se
    // aplica (recurso ligado + hospedagem ativa + categoria com kit) para decidir se é obrigatória.
    let stayForMinibar: { id: string } | null = null;
    let minibarApplies = false;
    if (task.type === "OCCUPIED") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { stockedRoomEnabled: true },
      });
      if (tenant?.stockedRoomEnabled) {
        const [stay, kitCount] = await Promise.all([
          prisma.stayCheckin.findFirst({
            where: { roomId: task.roomId, isClosed: false, tenantId: session.tenantId },
            orderBy: { checkInDate: "desc" },
            select: { id: true },
          }),
          prisma.stockedRoomKitItem.count({
            where: { tenantId: session.tenantId, roomCategoryId: task.room.categoryId },
          }),
        ]);
        if (stay && kitCount > 0) {
          stayForMinibar = stay;
          minibarApplies = true;
        }
      }
    }

    if (minibarApplies && minibarFound.length === 0) {
      return NextResponse.json(
        { success: false, error: "Informe a conferência do frigobar antes de concluir a arrumação." },
        { status: 400 }
      );
    }

    const result = await txWithRetry(async (tx) => {
      let minibar = null as Awaited<ReturnType<typeof applyMinibarCheck>> | null;

      if (minibarApplies && stayForMinibar) {
        // Trava a hospedagem antes de mexer em consumo/estoque — mesmo lock do check-out e do
        // lançamento de consumo (ver /api/stay/checkin PATCH e /api/stay/consumo).
        await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stayForMinibar.id} FOR UPDATE`;
        minibar = await applyMinibarCheck(tx, {
          tenantId: session.tenantId,
          stayCheckinId: stayForMinibar.id,
          roomId: task.roomId,
          source: "CLEANING",
          housekeepingTaskId: task.id,
          performedByType: "HOUSEKEEPER",
          performedById: session.housekeeperId,
          performedByName: session.name,
          found: minibarFound,
        });
      }

      const updatedTask = await tx.housekeepingTask.update({
        where: { id },
        data: {
          status: "DONE",
          finishedAt,
          durationSeconds,
          notes: typeof notes === "string" ? notes : task.notes,
        },
      });

      if (task.type === "CHECKOUT" && task.room.status === "VACANT_DIRTY") {
        await tx.room.update({ where: { id: task.roomId }, data: { status: "VACANT_CLEAN" } });
      }

      return { updatedTask, minibar };
    });

    if (result.minibar && !result.minibar.skipped && result.minibar.totalSold > 0) {
      const linhas = result.minibar.soldLines
        .map((l) => `${l.soldQty}x ${l.productName}`)
        .join(", ");
      await logActivity({
        tenantId: session.tenantId,
        userName: session.name,
        action: "MINIBAR_CHECK_CLEANING",
        description: `${session.name} conferiu o frigobar do quarto ${task.room.number} na arrumação: ${linhas} (R$ ${result.minibar.totalSold.toFixed(2)}).`,
        entityType: "STAY_CHECKIN",
        entityId: stayForMinibar?.id,
      });
    }

    return NextResponse.json({
      success: true,
      task: result.updatedTask,
      minibar: result.minibar && !result.minibar.skipped
        ? { totalSold: result.minibar.totalSold, soldLines: result.minibar.soldLines }
        : null,
    });
  } catch (error: any) {
    console.error("[POST /api/housekeeping/tasks/[id]/finish] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao concluir limpeza." },
      { status: 500 }
    );
  }
}
