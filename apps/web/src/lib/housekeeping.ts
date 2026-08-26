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

  // Arrumações do dia que perderam o sentido: o quarto deixou de estar ocupado (check-out no meio
  // do dia) e a limpeza ainda não começou. Preserva IN_PROGRESS / DONE / SKIPPED (histórico).
  await prisma.housekeepingTask.deleteMany({
    where: {
      tenantId,
      type: "OCCUPIED",
      serviceDate: today,
      status: "PENDING",
      room: { status: { not: "OCCUPIED" } },
    },
  });
}
