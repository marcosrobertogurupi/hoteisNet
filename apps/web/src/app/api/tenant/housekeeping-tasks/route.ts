import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { housekeepingTasksVersion, notModifiedResponse } from "@/lib/mapVersion";
import { housekeepingTasksPayload } from "@/lib/mapQueries";
import { sendUazapiText } from "@/lib/uazapi";

// GET /api/tenant/housekeeping-tasks — tarefas de limpeza em aberto do tenant da sessão, usado na
// tela de atribuição manual (Governança) e no selo visual do Mapa de Quartos. Retorna as tarefas
// IN_PROGRESS e as PENDING que representam uma atribuição real (feita pela recepção ou limpeza pós
// check-out) — a arrumação diária automática do modo QUEUE ainda sem governanta fica de fora, para
// não inflar o payload dos pollings nem virar falsa "atribuição" na Governança. `dndTodayRoomIds`
// traz os quartos com "não perturbe" registrado hoje, para o selo no Mapa.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    // Resposta condicional (304) — este endpoint é consultado no polling de 3 s tanto do Mapa de
    // Quartos quanto do Mapa de Reservas. Ver lib/mapVersion.ts.
    const etag = `"hktasks-${await housekeepingTasksVersion(resolvedTenantId)}"`;
    const notModified = notModifiedResponse(req, etag);
    if (notModified) return notModified;

    // Montagem do payload em lib/mapQueries.ts, compartilhada com /api/mapa/quartos-tick e
    // /api/mapa/reservas-tick.
    const { tasks, dndTodayRoomIds } = await housekeepingTasksPayload(resolvedTenantId);

    return NextResponse.json(
      { success: true, tasks, dndTodayRoomIds },
      { headers: { ETag: etag, "Cache-Control": "no-cache, must-revalidate" } },
    );
  } catch (error: any) {
    console.error("[GET /api/tenant/housekeeping-tasks] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar tarefas de limpeza." },
      { status: 500 }
    );
  }
}

// POST /api/tenant/housekeeping-tasks — atribui (ou reatribui) um quarto a uma governanta. Cria
// uma tarefa PENDING; se já existir uma tarefa PENDING para o quarto, apenas troca a governanta.
// Um quarto com tarefa IN_PROGRESS não pode ser reatribuído (limpeza já em andamento).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const body = await req.json();
    const { roomId, housekeeperId, type } = body;
    const taskType: "CHECKOUT" | "OCCUPIED" = type === "OCCUPIED" ? "OCCUPIED" : "CHECKOUT";

    if (!roomId || !housekeeperId) {
      return NextResponse.json({ success: false, error: "Quarto e governanta são obrigatórios." }, { status: 400 });
    }

    const [room, housekeeper] = await Promise.all([
      prisma.room.findFirst({ where: { id: roomId, tenantId: resolvedTenantId }, select: { status: true } }),
      prisma.housekeeper.findFirst({
        where: { id: housekeeperId, tenantId: resolvedTenantId, active: true },
        select: { id: true, name: true, whatsapp: true },
      }),
    ]);
    if (!room) return NextResponse.json({ success: false, error: "Quarto não encontrado." }, { status: 404 });
    if (!housekeeper) return NextResponse.json({ success: false, error: "Governanta não encontrada ou inativa." }, { status: 404 });

    // OCCUPIED (arrumação com hóspede no quarto) só faz sentido em quarto ocupado; CHECKOUT
    // (limpeza profunda pós-saída) só em quarto vago aguardando higienização.
    if (taskType === "OCCUPIED" && room.status !== "OCCUPIED") {
      return NextResponse.json(
        { success: false, error: "Arrumação com hóspede só pode ser atribuída a um quarto ocupado." },
        { status: 400 }
      );
    }
    if (taskType === "CHECKOUT" && room.status !== "VACANT_DIRTY") {
      return NextResponse.json(
        { success: false, error: "Limpeza pós check-out só pode ser atribuída a um quarto vago aguardando higienização." },
        { status: 400 }
      );
    }

    const existing = await prisma.housekeepingTask.findFirst({
      where: { tenantId: resolvedTenantId, roomId, type: taskType, status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: { id: true, status: true, housekeeperId: true },
    });

    if (existing?.status === "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, error: "Este quarto já está com limpeza em andamento e não pode ser reatribuído." },
        { status: 409 }
      );
    }

    let taskId: string;
    if (existing) {
      // Filtro de tenant (e de status) repetido na própria escrita — se a governanta iniciou a
      // limpeza entre a leitura acima e aqui, a reatribuição não acontece.
      const updated = await prisma.housekeepingTask.updateMany({
        where: { id: existing.id, tenantId: resolvedTenantId, status: "PENDING" },
        data: { housekeeperId, assignedAt: new Date() },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { success: false, error: "Este quarto já está com limpeza em andamento e não pode ser reatribuído." },
          { status: 409 }
        );
      }
      taskId = existing.id;
    } else {
      const created = await prisma.housekeepingTask.create({
        data: { tenantId: resolvedTenantId, roomId, housekeeperId, type: taskType, status: "PENDING", assignedAt: new Date() },
        select: { id: true },
      });
      taskId = created.id;
    }

    const task = await prisma.housekeepingTask.findFirst({
      where: { id: taskId, tenantId: resolvedTenantId },
      select: {
        id: true,
        roomId: true,
        type: true,
        status: true,
        housekeeper: { select: { id: true, name: true, photoUrl: true } },
        room: { select: { id: true, number: true } },
      },
    });
    if (!task) return NextResponse.json({ success: false, error: "Tarefa não encontrada." }, { status: 404 });

    // Modo "Fila de quartos": a governanta normalmente escolhe sozinha no app o que limpar, então
    // uma atribuição direta da recepção é uma exceção que ela não esperaria — o agente operacional
    // avisa por WhatsApp. Só quando a governanta de fato muda (arrastar de novo a mesma pessoa não
    // repete o aviso). Dispara depois da resposta (after()) e nunca falha a atribuição se o envio
    // der erro. No modo "Recepção define" não avisa: lá toda limpeza chega assim e a governanta
    // já acompanha a própria lista no app.
    if (existing?.housekeeperId !== housekeeperId) {
      const operator = { userId: session.userId, name: session.name };
      after(async () => {
        try {
          const hkSetting = await prisma.housekeepingSetting.findUnique({
            where: { tenantId: resolvedTenantId },
            select: { assignmentMode: true },
          });
          if (hkSetting?.assignmentMode !== "QUEUE") return;

          const roomNumber = task.room.number;
          const what =
            taskType === "OCCUPIED"
              ? `a arrumação do quarto ${roomNumber} (quarto ocupado, com hóspede)`
              : `a limpeza do quarto ${roomNumber} (pós check-out)`;
          const message = `Olá ${housekeeper.name}! A recepção designou você para ${what}. O quarto já aparece para você no aplicativo da governança.`;
          const sent = await sendUazapiText(housekeeper.whatsapp, message, resolvedTenantId);

          await prisma.auditLog.create({
            data: {
              tenantId: resolvedTenantId,
              userName: "Agente Operacional",
              action: "AGENT_HOUSEKEEPING_ASSIGNMENT_NOTICE",
              entityType: "ROOM",
              entityId: roomId,
              description: sent
                ? `Governanta ${housekeeper.name} avisada por WhatsApp da atribuição do quarto ${roomNumber} (feita por ${operator.name}).`
                : `Não foi possível avisar por WhatsApp a governanta ${housekeeper.name} da atribuição do quarto ${roomNumber} (feita por ${operator.name}).`,
              details: { assignedByUserId: operator.userId, housekeeperId: housekeeper.id, taskId: task.id, sent },
            },
          });
        } catch (err) {
          console.error("[POST /api/tenant/housekeeping-tasks] Erro ao avisar governanta por WhatsApp:", err);
        }
      });
    }

    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    console.error("[POST /api/tenant/housekeeping-tasks] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao atribuir quarto." },
      { status: 500 }
    );
  }
}
