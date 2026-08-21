import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";

// Ordena andar e número de quarto numericamente quando possível ("2" antes de "10"), com
// fallback alfabético para valores não numéricos (ex.: andar "Térreo").
function naturalCompare(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

// GET /api/housekeeping/rooms — quartos que a governanta logada deve ver no app. Existem dois
// tipos de limpeza, cada um com sua própria regra de visibilidade:
//  - CHECKOUT (limpeza profunda de quarto vago pós check-out): segue o modo de atribuição do
//    assinante (HousekeepingSetting.assignmentMode) — RECEPTION mostra só o que foi atribuído a
//    ela; QUEUE mostra a fila geral de quartos sujos sem limpeza em andamento.
//  - OCCUPIED (arrumação de quarto com hóspede hospedado): nunca cai em fila — só aparece quando
//    a recepção atribuiu esse quarto especificamente a ela, porque só a recepção sabe se o
//    hóspede está no quarto/autoriza a entrada.
// Resultado agrupado por andar, em ordem crescente de andar e depois de número do quarto.
export async function GET(req: NextRequest) {
  try {
    const session = await getHousekeeperSession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }

    const setting = await prisma.housekeepingSetting.findUnique({ where: { tenantId: session.tenantId } });
    const assignmentMode = setting?.assignmentMode || "RECEPTION";

    const rooms = await prisma.room.findMany({
      where: { tenantId: session.tenantId, active: true },
      select: {
        id: true,
        number: true,
        floor: true,
        category: { select: { name: true } },
        housekeepingTasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, type: true, status: true, notes: true, startedAt: true, housekeeperId: true },
        },
      },
    });

    const visible = rooms
      .map((r) => ({ ...r, task: r.housekeepingTasks[0] || null }))
      .filter((r) => {
        if (!r.task) {
          // Sem tarefa ativa: só entra na fila espontânea de CHECKOUT no modo QUEUE.
          return assignmentMode === "QUEUE";
        }
        if (r.task.type === "OCCUPIED") {
          return r.task.housekeeperId === session.housekeeperId;
        }
        // CHECKOUT
        if (assignmentMode === "RECEPTION") {
          return r.task.housekeeperId === session.housekeeperId;
        }
        return r.task.status === "IN_PROGRESS" && r.task.housekeeperId === session.housekeeperId;
      })
      .sort((a, b) => naturalCompare(a.number, b.number));

    const floorsMap = new Map<string, typeof visible>();
    for (const room of visible) {
      const floorKey = room.floor?.trim() || "Sem andar";
      if (!floorsMap.has(floorKey)) floorsMap.set(floorKey, []);
      floorsMap.get(floorKey)!.push(room);
    }

    const floors = Array.from(floorsMap.entries())
      .sort(([a], [b]) => naturalCompare(a, b))
      .map(([floor, floorRooms]) => ({
        floor,
        rooms: floorRooms.map((r) => ({
          id: r.id,
          number: r.number,
          category: r.category?.name || null,
          taskId: r.task?.id || null,
          type: r.task?.type || "CHECKOUT",
          status: r.task?.status || "PENDING",
          notes: r.task?.notes || null,
          startedAt: r.task?.startedAt || null,
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
