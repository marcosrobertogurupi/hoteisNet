import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendUazapiText } from "@/lib/uazapi";

// DELETE /api/tenant/housekeeping-tasks/[id] — cancela uma atribuição ainda não iniciada
// (só permitido em status PENDING; uma limpeza IN_PROGRESS não pode ser cancelada por aqui).
// Quando a tarefa é a arrumação diária automática do modo QUEUE (tem serviceDate), não apaga o
// registro — apenas tira a governanta, devolvendo o quarto para a fila geral.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const { id } = await params;
    const task = await prisma.housekeepingTask.findFirst({
      where: { id, tenantId },
      select: {
        status: true,
        serviceDate: true,
        type: true,
        roomId: true,
        housekeeperId: true,
        room: { select: { number: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Atribuição não encontrada." }, { status: 404 });
    }
    if (task.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: "Só é possível cancelar atribuições que ainda não foram iniciadas." },
        { status: 409 }
      );
    }

    const result = task.serviceDate
      ? await prisma.housekeepingTask.updateMany({
          where: { id, tenantId, status: "PENDING" },
          data: { housekeeperId: null, assignedAt: null },
        })
      : await prisma.housekeepingTask.deleteMany({ where: { id, tenantId, status: "PENDING" } });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Só é possível cancelar atribuições que ainda não foram iniciadas." },
        { status: 409 }
      );
    }

    // Modo "Fila de quartos": a governanta que tinha sido designada pela recepção é avisada por
    // WhatsApp de que não precisa mais cuidar do quarto (mesmo aviso da reatribuição em
    // POST /api/tenant/housekeeping-tasks). Depois da resposta (after()), sem nunca falhar o
    // cancelamento. No modo "Recepção define" não avisa.
    if (task.housekeeperId) {
      const housekeeperId = task.housekeeperId;
      const operator = { userId: session.userId, name: session.name };
      after(async () => {
        try {
          const [hkSetting, housekeeper] = await Promise.all([
            prisma.housekeepingSetting.findUnique({ where: { tenantId }, select: { assignmentMode: true } }),
            prisma.housekeeper.findFirst({
              where: { id: housekeeperId, tenantId, active: true },
              select: { id: true, name: true, whatsapp: true },
            }),
          ]);
          if (hkSetting?.assignmentMode !== "QUEUE" || !housekeeper) return;

          const roomNumber = task.room.number;
          const what = task.type === "OCCUPIED" ? `a arrumação do quarto ${roomNumber}` : `a limpeza do quarto ${roomNumber}`;
          const message = `Olá ${housekeeper.name}! A recepção cancelou a sua designação para ${what}. Você não precisa mais cuidar desse quarto — ele voltou para a fila geral.`;
          const sent = await sendUazapiText(housekeeper.whatsapp, message, tenantId);

          await prisma.auditLog.create({
            data: {
              tenantId,
              userName: "Agente Operacional",
              action: "AGENT_HOUSEKEEPING_UNASSIGNMENT_NOTICE",
              entityType: "ROOM",
              entityId: task.roomId,
              description: sent
                ? `Governanta ${housekeeper.name} avisada por WhatsApp do cancelamento da atribuição do quarto ${roomNumber} (feito por ${operator.name}).`
                : `Não foi possível avisar por WhatsApp a governanta ${housekeeper.name} do cancelamento da atribuição do quarto ${roomNumber} (feito por ${operator.name}).`,
              details: { cancelledByUserId: operator.userId, housekeeperId: housekeeper.id, taskId: id, sent },
            },
          });
        } catch (err) {
          console.error("[DELETE /api/tenant/housekeeping-tasks/[id]] Erro ao avisar governanta por WhatsApp:", err);
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/tenant/housekeeping-tasks/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao cancelar atribuição." },
      { status: 500 }
    );
  }
}
