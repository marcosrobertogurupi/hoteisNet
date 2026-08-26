import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";
import { ensureDailyArrumacaoTasks } from "@/lib/housekeeping";

// Ordena andar e número de quarto numericamente quando possível ("2" antes de "10"), com
// fallback alfabético para valores não numéricos (ex.: andar "Térreo").
function naturalCompare(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

// GET /api/housekeeping/rooms — quartos que a governanta logada deve ver no app, agrupados por
// andar, com dois blocos por andar:
//  - `pending`       — o que ainda falta fazer (aparece em "A limpar").
//  - `resolvedToday` — arrumações de quarto ocupado já resolvidas hoje no modo QUEUE (limpas ou
//                      marcadas como "não perturbe"), para "Resolvidos hoje".
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
    const today = dateOnlyBrasilia(new Date());

    const rooms = await prisma.room.findMany({
      where: { tenantId: session.tenantId, active: true },
      select: {
        id: true,
        number: true,
        floor: true,
        status: true,
        category: { select: { name: true } },
        housekeepingTasks: {
          where: {
            OR: [
              { status: { in: ["PENDING", "IN_PROGRESS"] } },
              { type: "OCCUPIED", serviceDate: today, status: { in: ["DONE", "SKIPPED"] } },
            ],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            status: true,
            notes: true,
            startedAt: true,
            finishedAt: true,
            skipReason: true,
            serviceDate: true,
            housekeeperId: true,
            housekeeper: { select: { name: true } },
          },
        },
      },
    });

    const mine = session.housekeeperId;

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
    };
    type ResolvedRoom = {
      id: string;
      number: string;
      floor: string;
      category: string | null;
      taskId: string;
      outcome: "CLEANED" | "DND";
      resolvedAt: Date | null;
      resolvedByName: string | null;
      notes: string | null;
    };

    const pending: PendingRoom[] = [];
    const resolved: ResolvedRoom[] = [];

    for (const room of rooms) {
      const tasks = room.housekeepingTasks;
      const active = tasks.find((t) => t.status === "PENDING" || t.status === "IN_PROGRESS") || null;
      const resolvedToday =
        assignmentMode === "QUEUE"
          ? tasks.find(
              (t) =>
                t.type === "OCCUPIED" &&
                (t.status === "DONE" || t.status === "SKIPPED") &&
                t.serviceDate != null &&
                new Date(t.serviceDate).getTime() === today.getTime()
            ) || null
          : null;

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
          });
        }
        continue;
      }

      if (resolvedToday) {
        resolved.push({
          ...base,
          taskId: resolvedToday.id,
          outcome: resolvedToday.status === "SKIPPED" ? "DND" : "CLEANED",
          resolvedAt: resolvedToday.finishedAt,
          resolvedByName: resolvedToday.housekeeper?.name || null,
          notes: resolvedToday.notes,
        });
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
        });
      }
    }

    const floorKeys = Array.from(
      new Set([...pending.map((r) => r.floor), ...resolved.map((r) => r.floor)])
    ).sort(naturalCompare);

    const floors = floorKeys.map((floor) => ({
      floor,
      pending: pending
        .filter((r) => r.floor === floor)
        .sort((a, b) => naturalCompare(a.number, b.number))
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
        })),
      resolvedToday: resolved
        .filter((r) => r.floor === floor)
        .sort((a, b) => naturalCompare(a.number, b.number))
        .map((r) => ({
          id: r.id,
          number: r.number,
          category: r.category,
          taskId: r.taskId,
          outcome: r.outcome,
          resolvedAt: r.resolvedAt,
          resolvedByName: r.resolvedByName,
          notes: r.notes,
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
