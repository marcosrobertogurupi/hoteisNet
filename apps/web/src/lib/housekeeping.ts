import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

// Geração da "arrumação do dia" no modo QUEUE (Fila de quartos). Ver PLANO_GOVERNANCA_FILA.md.
//
// No modo QUEUE, cada quarto ocupado deve ter uma HousekeepingTask OCCUPIED por dia
// (serviceDate = meia-noite de Brasília), que entra na fila geral para qualquer governanta
// assumir. Assim a mecânica de "quem toca primeiro assume / some da fila das outras / conclui e
// fica resolvido até amanhã" — que já vale para limpeza pós check-out — passa a valer igual para
// arrumação de quarto ocupado, sem lógica nova de concorrência.
//
// É idempotente: o índice único (roomId, type, serviceDate) + createMany({ skipDuplicates })
// garantem que rodar de novo não cria nada. Chamada em GET /api/housekeeping/rooms (com o guard
// de intervalo abaixo, por causa do polling de 4s do app), no login da governanta e no início do
// "start" como rede de segurança.

// Guard best-effort por tenant — não roda a varredura a cada poll de 4s do app da governanta.
const lastRunByTenant = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000;

export async function ensureDailyArrumacaoTasks(tenantId: string): Promise<void> {
  const now = Date.now();
  const last = lastRunByTenant.get(tenantId);
  if (last && now - last < MIN_INTERVAL_MS) return;
  // Marca já no início: se duas requisições entrarem juntas, só uma faz o trabalho; o
  // skipDuplicates cobre a corrida remanescente.
  lastRunByTenant.set(tenantId, now);

  const setting = await prisma.housekeepingSetting.findUnique({ where: { tenantId } });
  if (!setting || setting.assignmentMode !== "QUEUE" || !setting.autoDailyArrumacao) return;

  const today = dateOnlyBrasilia(new Date());

  const occupiedRooms = await prisma.room.findMany({
    where: { tenantId, active: true, status: "OCCUPIED" },
    select: {
      id: true,
      checkins: {
        where: { isClosed: false },
        orderBy: { checkInDate: "desc" },
        take: 1,
        select: { checkInDate: true },
      },
    },
  });

  const eligibleRoomIds: string[] = [];
  for (const room of occupiedRooms) {
    if (setting.arrumacaoSkipCheckinDay) {
      const checkInDate = room.checkins[0]?.checkInDate;
      // Quarto que fez check-in hoje acabou de ser preparado para a chegada — não gera arrumação.
      if (checkInDate && dateOnlyBrasilia(checkInDate).getTime() === today.getTime()) continue;
    }
    eligibleRoomIds.push(room.id);
  }

  if (eligibleRoomIds.length > 0) {
    await prisma.housekeepingTask.createMany({
      data: eligibleRoomIds.map((roomId) => ({
        tenantId,
        roomId,
        type: "OCCUPIED" as const,
        status: "PENDING" as const,
        serviceDate: today,
      })),
      skipDuplicates: true,
    });
  }

  // Arrumações OCCUPIED que perderam o sentido, em dois casos:
  //  1. serviceDate de hoje, mas o quarto deixou de estar ocupado (check-out no meio do dia).
  //  2. serviceDate de um dia anterior — a fila daquele dia já morreu na virada; deixar "presa"
  //     fazia o quarto ficar preso em "Arrumação c/ hóspede" indefinidamente (inclusive depois de
  //     um check-out real, mascarando a limpeza pós check-out — ver bug do quarto 306).
  const staleOccupiedWhere = {
    tenantId,
    type: "OCCUPIED" as const,
    OR: [
      { serviceDate: today, room: { status: { not: "OCCUPIED" as const } } },
      { serviceDate: { lt: today } },
    ],
  };

  // PENDING (ninguém trabalhou nela): some sem deixar rastro.
  await prisma.housekeepingTask.deleteMany({
    where: { ...staleOccupiedWhere, status: "PENDING" },
  });

  // IN_PROGRESS (a governanta começou a arrumação e o hóspede fez check-out antes de ela concluir):
  // não pode ficar presa. Além de manter o quarto eternamente em "Arrumação c/ hóspede" no Mapa e
  // o selo na recepção, ela travava o app da governanta — a limpeza pós check-out aparecia como
  // "Iniciar Limpeza", mas o endpoint /start reencontrava esta tarefa OCCUPIED ainda IN_PROGRESS e
  // não transicionava nada, então o botão voltava para "Iniciar Limpeza" a cada toque. Encerra
  // como SKIPPED/OTHER preservando quem começou e quando — vira registro de arrumação interrompida
  // no histórico, não some.
  await prisma.housekeepingTask.updateMany({
    where: { ...staleOccupiedWhere, status: "IN_PROGRESS" },
    data: {
      status: "SKIPPED",
      skipReason: "OTHER",
      finishedAt: new Date(),
      durationSeconds: null,
      notes: "Arrumação interrompida — hóspede fez check-out antes da conclusão.",
    },
  });
}
