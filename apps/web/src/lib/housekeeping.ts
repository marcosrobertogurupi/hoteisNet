import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

type Db = Prisma.TransactionClient | typeof prisma;
type RoomStatusValue = "VACANT_CLEAN" | "VACANT_DIRTY" | "OCCUPIED" | "MAINTENANCE";

// Motivo gravado numa arrumação que já estava EM ANDAMENTO quando o quarto mudou de situação.
export const ARRUMACAO_INTERRUPTED_NOTE = {
  CHECKOUT: "Arrumação interrompida — hóspede fez check-out antes da conclusão.",
  TRANSFER: "Arrumação interrompida — hóspede transferido para outro quarto antes da conclusão.",
  CHECKIN: "Arrumação encerrada — novo check-in no quarto.",
  STATUS_CHANGE: "Arrumação interrompida — a recepção alterou a situação do quarto antes da conclusão.",
} as const;

// Uma tarefa de governança só vale enquanto combina com a situação do quarto: a arrumação com
// hóspede (OCCUPIED) pertence à hospedagem que estava no quarto quando ela foi criada, e a limpeza
// pós check-out (CHECKOUT) a um quarto vago aguardando higienização. Chamada em TODA troca de
// situação do quarto — check-in, check-out, transferência (origem e destino) e alteração manual
// pela recepção — dentro da mesma transação da troca, para encerrar o que deixou de combinar:
//  - Arrumação OCCUPIED em aberto: sempre. O quarto ficou vago ou recebeu um NOVO hóspede; nos dois
//    casos a arrumação antiga não vale mais. Isso inclui a atribuição manual da recepção
//    (serviceDate NULL), que a limpeza de rotina por dia (ensureDailyArrumacaoTasks) não alcança
//    pela data — ela ficava PENDING para sempre e o quarto voltava a aparecer como "arrumação com
//    hóspede" no app da governanta assim que ficava limpo (quarto 114: atribuído à Rita no dia do
//    check-in, em 11/09, e ainda na lista dela em 24/09 com o quarto livre no Mapa). Se o quarto
//    fosse ocupado de novo, a tarefa do hóspede anterior passaria a valer para o novo.
//  - Limpeza CHECKOUT ainda PENDING: quando o quarto não vai para VACANT_DIRTY (ficou limpo, entrou
//    em manutenção ou foi ocupado). Uma CHECKOUT IN_PROGRESS fica — a governanta está limpando e
//    conclui normalmente.
// PENDING (ninguém começou) some sem deixar rastro, igual à arrumação diária vencida; arrumação
// IN_PROGRESS vira SKIPPED/OTHER preservando quem começou e quando (registro de arrumação
// interrompida no Histórico de Limpeza).
export async function syncHousekeepingTasksWithRoomStatus(
  db: Db,
  params: { tenantId: string; roomId: string; newStatus: RoomStatusValue; interruptedNote: string },
): Promise<void> {
  const { tenantId, roomId, newStatus, interruptedNote } = params;

  await db.housekeepingTask.deleteMany({
    where: {
      tenantId,
      roomId,
      status: "PENDING",
      type: { in: newStatus === "VACANT_DIRTY" ? ["OCCUPIED"] : ["OCCUPIED", "CHECKOUT"] },
    },
  });
  await db.housekeepingTask.updateMany({
    where: { tenantId, roomId, type: "OCCUPIED", status: "IN_PROGRESS" },
    data: {
      status: "SKIPPED",
      skipReason: "OTHER",
      finishedAt: new Date(),
      durationSeconds: null,
      notes: interruptedNote,
    },
  });
}

// Espelho, na leitura, da regra acima: o app da governanta (lista e "iniciar") só considera uma
// tarefa em aberto que combina com a situação ATUAL do quarto. Protege contra tarefas gravadas
// antes desta regra existir e contra qualquer troca de situação que escape da sincronização.
export function taskFitsRoomStatus(task: { type: string; status: string }, roomStatus: string): boolean {
  if (task.type === "OCCUPIED") return roomStatus === "OCCUPIED";
  return task.status === "IN_PROGRESS" || roomStatus === "VACANT_DIRTY";
}

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
// "start" como rede de segurança. A limpeza de rotina das arrumações vencidas roda em qualquer
// modo; só a geração é exclusiva do QUEUE.

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

  const setting = await prisma.housekeepingSetting.findUnique({
    where: { tenantId },
    select: { assignmentMode: true, autoDailyArrumacao: true, arrumacaoSkipCheckinDay: true },
  });

  const today = dateOnlyBrasilia(new Date());

  if (setting?.assignmentMode === "QUEUE" && setting.autoDailyArrumacao) {
    await generateDailyArrumacaoTasks(tenantId, today, setting.arrumacaoSkipCheckinDay);
  }

  // Arrumações OCCUPIED que perderam o sentido, em dois casos:
  //  1. O quarto deixou de estar ocupado (check-out/transferência no meio do dia) — qualquer
  //     serviceDate, INCLUSIVE NULL (atribuição manual da recepção). A troca de situação do quarto
  //     já encerra isso na hora (syncHousekeepingTasksWithRoomStatus); aqui é a rede de segurança,
  //     que também limpa o que ficou preso antes daquela regra existir. Roda em qualquer modo — no
  //     RECEPTION a atribuição manual ficava igualmente presa depois do check-out.
  //  2. serviceDate de um dia anterior — a fila daquele dia já morreu na virada; deixar "presa"
  //     fazia o quarto ficar preso em "Arrumação c/ hóspede" indefinidamente (inclusive depois de
  //     um check-out real, mascarando a limpeza pós check-out — ver bug do quarto 306).
  const staleOccupiedWhere = {
    tenantId,
    type: "OCCUPIED" as const,
    OR: [
      { room: { status: { not: "OCCUPIED" as const } } },
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
      notes: ARRUMACAO_INTERRUPTED_NOTE.CHECKOUT,
    },
  });
}

async function generateDailyArrumacaoTasks(tenantId: string, today: Date, skipCheckinDay: boolean): Promise<void> {
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
    if (skipCheckinDay) {
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
}
