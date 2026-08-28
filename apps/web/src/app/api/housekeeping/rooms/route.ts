import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

// Ordena andar e número de quarto numericamente quando possível ("2" antes de "10"), com
// fallback alfabético para valores não numéricos (ex.: andar "Térreo").
function naturalCompare(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

// GET /api/housekeeping/rooms — quartos que a governanta logada ainda precisa tratar, agrupados
// por andar em um único bloco `pending` ("A limpar").
//
// Assim que um quarto é resolvido (limpeza pós check-out concluída, arrumação de quarto ocupado
// concluída ou marcada como "não perturbe"), ele SAI por completo da relação da governanta — o
// app dela não mostra "resolvidos hoje". O acompanhamento do que já foi feito no dia fica na
// recepção (Mapa de Quartos / Governança / Histórico de Limpeza), não no celular da governanta.
//
// Regras de visibilidade (ver PLANO_GOVERNANCA_FILA.md):
//  - CHECKOUT (limpeza pós check-out de quarto vago): modo RECEPTION mostra só o que foi atribuído
//    a ela; modo QUEUE mostra a fila geral de quartos VACANT_DIRTY sem limpeza em andamento.
//  - OCCUPIED (arrumação com hóspede): modo RECEPTION só quando a recepção atribuiu a ela; modo
//    QUEUE entra na fila geral (uma tarefa por quarto ocupado por dia, gerada automaticamente).
//  - Quarto VACANT_CLEAN / MAINTENANCE nunca aparece.
export async function GET(req: NextRequest) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    // Gera/limpa a arrumação do dia (só faz algo no modo QUEUE; tem guard de intervalo interno).
    try {
      await ensureDailyArrumacaoTasks(session.tenantId);
    } catch (e) {
      console.error("[GET /api/housekeeping/rooms] ensureDailyArrumacaoTasks falhou:", e);
    }

    const setting = await prisma.housekeepingSetting.findUnique({ where: { tenantId: session.tenantId } });
    const assignmentMode = setting?.assignmentMode || "RECEPTION";

    const rooms = await prisma.room.findMany({
      where: { tenantId: session.tenantId, active: true },
      select: {
        id: true,
        number: true,
        floor: true,
        status: true,
        category: { select: { name: true } },
        housekeepingTasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            notes: true,
            startedAt: true,
            housekeeperId: true,
          },
        },
      },
    });

    const mine = session.housekeeperId;

    // Quartos com reserva CHEGANDO HOJE ainda pendente de check-in — só usado no modo QUEUE para
    // furar a fila: um quarto em limpeza pós check-out cuja diária de hoje já está reservada precisa
    // ser priorizado. "Hoje" ancorado no fuso de Brasília (servidor roda em UTC em produção),
    // mesma janela usada nos mapas (ver apps/web/src/lib/mapQueries.ts).
    const arrivingTodayRoomIds = new Set<string>();
    if (assignmentMode === "QUEUE") {
      const todaySpStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const dayStart = new Date(`${todaySpStr}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const todayArrivals = await prisma.reservation.findMany({
        where: {
          tenantId: session.tenantId,
          status: { notIn: ["CANCELLED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"] },
          checkInDate: { gte: dayStart, lt: dayEnd },
        },
        select: { roomId: true },
      });
      for (const r of todayArrivals) arrivingTodayRoomIds.add(r.roomId);
    }

    type PendingRoom = {
      id: string;
      number: string;
      floor: string;
      category: string | null;
      roomStatus: string;
      taskId: string | null;
      type: "CHECKOUT" | "OCCUPIED";
      status: "PENDING" | "IN_PROGRESS";
      notes: string | null;
      startedAt: Date | null;
      priority: boolean;
    };

    const pending: PendingRoom[] = [];

    for (const room of rooms) {
      const active = room.housekeepingTasks[0] || null;

      const base = {
        id: room.id,
        number: room.number,
        floor: room.floor?.trim() || "Sem andar",
        category: room.category?.name || null,
      };

      if (active) {
        const isMine = active.housekeeperId === mine;
        // Uma tarefa OCCUPIED PENDING no modo QUEUE é assumível por qualquer governanta; qualquer
        // outra combinação só aparece para a dona da tarefa.
        const visible =
          isMine ||
          (assignmentMode === "QUEUE" && active.type === "OCCUPIED" && active.status === "PENDING");
        if (visible) {
          pending.push({
            ...base,
            roomStatus: room.status,
            taskId: active.id,
            type: active.type,
            status: active.status as "PENDING" | "IN_PROGRESS",
            notes: active.notes,
            startedAt: active.startedAt,
            priority: active.type === "CHECKOUT" && arrivingTodayRoomIds.has(room.id),
          });
        }
        continue;
      }

      // Sem tarefa ativa: só a fila espontânea de limpeza pós check-out, e só no modo QUEUE.
      if (assignmentMode === "QUEUE" && room.status === "VACANT_DIRTY") {
        pending.push({
          ...base,
          roomStatus: room.status,
          taskId: null,
          type: "CHECKOUT",
          status: "PENDING",
          notes: null,
          startedAt: null,
          priority: arrivingTodayRoomIds.has(room.id),
        });
      }
    }

    const floorKeys = Array.from(new Set(pending.map((r) => r.floor))).sort(naturalCompare);

    const floors = floorKeys.map((floor) => ({
      floor,
      pending: pending
        .filter((r) => r.floor === floor)
        // Prioridade primeiro (limpeza pós check-out com reserva chegando hoje), depois ordem
        // natural de número de quarto dentro do andar.
        .sort((a, b) => (a.priority === b.priority ? naturalCompare(a.number, b.number) : a.priority ? -1 : 1))
        .map((r) => ({
          id: r.id,
          number: r.number,
          category: r.category,
          roomStatus: r.roomStatus,
          taskId: r.taskId,
          type: r.type,
          status: r.status,
          notes: r.notes,
          startedAt: r.startedAt,
          priority: r.priority,
        })),
    }));

    return NextResponse.json({ success: true, assignmentMode, floors });
  } catch (error: any) {
    console.error("[GET /api/housekeeping/rooms] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar quartos." },
      { status: 500 }
    );
  }
}
