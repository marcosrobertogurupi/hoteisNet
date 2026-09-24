import type { MaintenanceStage, Prisma, RoomStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncHousekeepingTasksWithRoomStatus, ARRUMACAO_INTERRUPTED_NOTE } from "@/lib/housekeeping";
import { MAINTENANCE_STAGE_LABEL } from "@/lib/maintenanceShared";

// Controle de manutenção de quartos — regras da OS (MaintenanceTicket). Funil:
//   OPEN (Entrada) → EVALUATING (Avaliando) → WAITING (Aguardando peça/profissional…) → RESOLVED
// A recepção abre a OS; só o colaborador de manutenção atribuído avança as etapas (app
// /manutencao); o admin pode reatribuir e cancelar. Enquanto a OS está aberta o quarto fica em
// MAINTENANCE e a troca genérica de situação (PATCH /api/reservations/rooms) não o libera.

type Db = Prisma.TransactionClient | typeof prisma;

export const OPEN_MAINTENANCE_STAGES: MaintenanceStage[] = ["OPEN", "EVALUATING", "WAITING"];

export { MAINTENANCE_STAGE_LABEL };

// Situações a partir das quais um quarto pode entrar em manutenção: livre ou sujo. Nunca ocupado
// — o hóspede precisa ser transferido antes (Transferência de Quarto).
const ROOM_STATUSES_ALLOWED_TO_OPEN: RoomStatus[] = ["VACANT_CLEAN", "VACANT_DIRTY"];

// Listas iniciais semeadas no primeiro uso de cada hotel — depois o próprio hotel edita.
export const DEFAULT_PROBLEM_TYPES = [
  "Elétrica",
  "Hidráulica",
  "Ar-condicionado",
  "Mobiliário",
  "Eletrônicos (TV/telefone)",
  "Portas e fechaduras",
  "Pintura e estrutura",
  "Outros",
];
export const DEFAULT_WAIT_REASONS = [
  "Aguardando peça ou material",
  "Aguardando profissional externo",
  "Aguardando aprovação de orçamento",
  "Outro motivo",
];

// Erro de regra de negócio com o status HTTP que a rota deve devolver.
export class MaintenanceError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export type MaintenanceActor = { userId: string | null; name: string };

// Semeia as listas padrão (tipos de problema e motivos de espera) quando o hotel ainda não tem
// nenhuma. skipDuplicates + @@unique([tenantId, name]) tornam chamadas concorrentes inofensivas.
export async function ensureMaintenanceDefaults(tenantId: string): Promise<void> {
  const [types, reasons] = await Promise.all([
    prisma.maintenanceProblemType.count({ where: { tenantId } }),
    prisma.maintenanceWaitReason.count({ where: { tenantId } }),
  ]);
  if (types === 0) {
    await prisma.maintenanceProblemType.createMany({
      data: DEFAULT_PROBLEM_TYPES.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
    });
  }
  if (reasons === 0) {
    await prisma.maintenanceWaitReason.createMany({
      data: DEFAULT_WAIT_REASONS.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
    });
  }
}

// Próximo nº de OS do hotel. A trava consultiva por tenant (liberada no fim da transação)
// serializa aberturas simultâneas do mesmo hotel; o @@unique([tenantId, number]) é a rede final.
async function nextMaintenanceTicketNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"maintenance_ticket:" + tenantId}))`;
  const last = await tx.maintenanceTicket.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

// Colaborador que pode receber uma OS: do hotel, ativo, marcado como manutenção e com WhatsApp
// (é por ele que chega o aviso). Id vindo do cliente — sempre revalidado contra o tenant.
async function findAssignableEmployee(db: Db, tenantId: string, employeeId: string) {
  const employee = await db.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true, name: true, active: true, maintenanceTech: true, phone: true },
  });
  if (!employee) throw new MaintenanceError("Colaborador não encontrado.", 404);
  if (!employee.active) throw new MaintenanceError(`${employee.name} está inativo no cadastro de Colaboradores.`);
  if (!employee.maintenanceTech) {
    throw new MaintenanceError(`${employee.name} não está marcado como colaborador de manutenção.`);
  }
  if (!employee.phone?.trim()) {
    throw new MaintenanceError(`${employee.name} não tem WhatsApp cadastrado — sem ele não dá para avisá-lo da OS.`);
  }
  return employee;
}

function roomMaintenanceNote(ticketNumber: number, problemTypeName: string, description: string): string {
  return `OS nº ${ticketNumber} — ${problemTypeName}: ${description}`;
}

// Abre uma OS: cria a OS e o evento de abertura, coloca o quarto em MAINTENANCE e encerra a
// governança pendente do quarto — tudo na mesma transação. A troca de situação é condicional
// (só de VACANT_CLEAN/VACANT_DIRTY), o que também impede duas OS abertas no mesmo quarto.
export async function openMaintenanceTicket(params: {
  tenantId: string;
  roomId: string;
  problemTypeId: string;
  description: string;
  assignedEmployeeId: string;
  expectedReleaseAt: Date | null;
  actor: MaintenanceActor;
}) {
  const description = params.description.trim();
  if (!description) throw new MaintenanceError("Descreva o problema do quarto.");
  if (description.length > 500) throw new MaintenanceError("A descrição do problema pode ter no máximo 500 caracteres.");
  if (params.expectedReleaseAt && params.expectedReleaseAt.getTime() <= Date.now()) {
    throw new MaintenanceError("A previsão de liberação precisa ser uma data futura.");
  }

  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findFirst({
      where: { id: params.roomId, tenantId: params.tenantId, active: true },
      select: { id: true, number: true, status: true },
    });
    if (!room) throw new MaintenanceError("Quarto não encontrado.", 404);
    if (room.status === "MAINTENANCE") {
      throw new MaintenanceError(`O quarto ${room.number} já está em manutenção.`, 409);
    }
    if (room.status === "OCCUPIED") {
      throw new MaintenanceError(
        `O quarto ${room.number} está ocupado. Transfira o hóspede para outro quarto antes de abrir a manutenção.`,
        409,
      );
    }

    const problemType = await tx.maintenanceProblemType.findFirst({
      where: { id: params.problemTypeId, tenantId: params.tenantId, active: true },
      select: { id: true, name: true },
    });
    if (!problemType) throw new MaintenanceError("Tipo de problema não encontrado.", 404);

    const employee = await findAssignableEmployee(tx, params.tenantId, params.assignedEmployeeId);
    const number = await nextMaintenanceTicketNumber(tx, params.tenantId);

    // Filtro de tenant e de situação direto na escrita (CLAUDE.md, Segurança §3).
    const moved = await tx.room.updateMany({
      where: { id: room.id, tenantId: params.tenantId, status: { in: ROOM_STATUSES_ALLOWED_TO_OPEN } },
      data: { status: "MAINTENANCE", notes: roomMaintenanceNote(number, problemType.name, description) },
    });
    if (moved.count === 0) {
      throw new MaintenanceError(`A situação do quarto ${room.number} acabou de mudar. Atualize a tela e tente de novo.`, 409);
    }

    const ticket = await tx.maintenanceTicket.create({
      data: {
        tenantId: params.tenantId,
        number,
        roomId: room.id,
        problemTypeId: problemType.id,
        description,
        assignedEmployeeId: employee.id,
        expectedReleaseAt: params.expectedReleaseAt,
        previousRoomStatus: room.status,
        openedByUserId: params.actor.userId,
        openedByName: params.actor.name,
      },
      select: { id: true, number: true, openedAt: true },
    });

    await tx.maintenanceTicketEvent.create({
      data: {
        tenantId: params.tenantId,
        ticketId: ticket.id,
        type: "OPENED",
        toStage: "OPEN",
        note: `${problemType.name}: ${description} — atribuída a ${employee.name}`,
        actorType: "USER",
        actorId: params.actor.userId,
        actorName: params.actor.name,
      },
    });

    await syncHousekeepingTasksWithRoomStatus(tx, {
      tenantId: params.tenantId,
      roomId: room.id,
      newStatus: "MAINTENANCE",
      interruptedNote: ARRUMACAO_INTERRUPTED_NOTE.STATUS_CHANGE,
    });

    return { ...ticket, roomNumber: room.number, employeeName: employee.name, problemTypeName: problemType.name };
  });
}

// Busca uma OS aberta do hotel para uma ação administrativa.
async function findOpenTicket(tx: Prisma.TransactionClient, tenantId: string, ticketId: string) {
  const ticket = await tx.maintenanceTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      number: true,
      stage: true,
      roomId: true,
      previousRoomStatus: true,
      assignedEmployeeId: true,
      assignedEmployee: { select: { name: true } },
      room: { select: { number: true } },
    },
  });
  if (!ticket) throw new MaintenanceError("OS não encontrada.", 404);
  if (!OPEN_MAINTENANCE_STAGES.includes(ticket.stage)) {
    throw new MaintenanceError(`A OS nº ${ticket.number} já está ${MAINTENANCE_STAGE_LABEL[ticket.stage].toLowerCase()}.`, 409);
  }
  return ticket;
}

// Admin passa a OS para outro colaborador (ex.: o técnico faltou). O aviso volta a PENDING para o
// worker avisar o novo responsável.
export async function reassignMaintenanceTicket(params: {
  tenantId: string;
  ticketId: string;
  employeeId: string;
  actor: MaintenanceActor;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await findOpenTicket(tx, params.tenantId, params.ticketId);
    if (ticket.assignedEmployeeId === params.employeeId) {
      throw new MaintenanceError(`A OS nº ${ticket.number} já está com ${ticket.assignedEmployee.name}.`);
    }
    const employee = await findAssignableEmployee(tx, params.tenantId, params.employeeId);

    const updated = await tx.maintenanceTicket.updateMany({
      where: { id: ticket.id, tenantId: params.tenantId, stage: { in: OPEN_MAINTENANCE_STAGES } },
      data: { assignedEmployeeId: employee.id, notifyStatus: "PENDING", notifyAttempts: 0, notifiedAt: null },
    });
    if (updated.count === 0) throw new MaintenanceError("A OS acabou de mudar. Atualize a tela e tente de novo.", 409);

    await tx.maintenanceTicketEvent.create({
      data: {
        tenantId: params.tenantId,
        ticketId: ticket.id,
        type: "REASSIGNED",
        note: `De ${ticket.assignedEmployee.name} para ${employee.name}`,
        actorType: "USER",
        actorId: params.actor.userId,
        actorName: params.actor.name,
      },
    });

    return { number: ticket.number, roomNumber: ticket.room.number, from: ticket.assignedEmployee.name, to: employee.name };
  });
}

// Admin cancela uma OS aberta por engano: o quarto volta para a situação anterior à manutenção.
// Não conta como tempo inativo no relatório (stage CANCELLED).
export async function cancelMaintenanceTicket(params: {
  tenantId: string;
  ticketId: string;
  reason: string;
  actor: MaintenanceActor;
}) {
  const reason = params.reason.trim();
  if (!reason) throw new MaintenanceError("Informe o motivo do cancelamento.");

  return prisma.$transaction(async (tx) => {
    const ticket = await findOpenTicket(tx, params.tenantId, params.ticketId);
    const now = new Date();

    const updated = await tx.maintenanceTicket.updateMany({
      where: { id: ticket.id, tenantId: params.tenantId, stage: { in: OPEN_MAINTENANCE_STAGES } },
      data: {
        stage: "CANCELLED",
        cancelledAt: now,
        cancelledByUserId: params.actor.userId,
        cancelledByName: params.actor.name,
        cancelReason: reason,
      },
    });
    if (updated.count === 0) throw new MaintenanceError("A OS acabou de mudar. Atualize a tela e tente de novo.", 409);

    await tx.maintenanceTicketEvent.create({
      data: {
        tenantId: params.tenantId,
        ticketId: ticket.id,
        type: "CANCELLED",
        fromStage: ticket.stage,
        toStage: "CANCELLED",
        note: reason,
        actorType: "USER",
        actorId: params.actor.userId,
        actorName: params.actor.name,
      },
    });

    // Só devolve a situação se o quarto ainda está em manutenção (condição na própria escrita).
    await tx.room.updateMany({
      where: { id: ticket.roomId, tenantId: params.tenantId, status: "MAINTENANCE" },
      data: { status: ticket.previousRoomStatus, notes: null },
    });

    return { number: ticket.number, roomNumber: ticket.room.number, roomStatus: ticket.previousRoomStatus };
  });
}

// Máximo de tentativas automáticas de envio do aviso por WhatsApp (worker). Esgotadas, o aviso
// fica FAILED e a recepção vê o alerta no card do quarto — reenviar é manual, nunca um retry sem teto.
export const MAX_MAINTENANCE_NOTIFY_ATTEMPTS = 3;

// Recepção pede para reenviar um aviso que não foi entregue: volta a PENDING com tentativas
// zeradas, e o worker tenta de novo (até MAX_MAINTENANCE_NOTIFY_ATTEMPTS).
export async function resendMaintenanceNotice(params: { tenantId: string; ticketId: string }) {
  const updated = await prisma.maintenanceTicket.updateMany({
    where: {
      id: params.ticketId,
      tenantId: params.tenantId,
      stage: { in: OPEN_MAINTENANCE_STAGES },
      notifyStatus: "FAILED",
    },
    data: { notifyStatus: "PENDING", notifyAttempts: 0 },
  });
  if (updated.count === 0) {
    throw new MaintenanceError("Só dá para reenviar o aviso de uma OS aberta cujo envio falhou.", 409);
  }
}

// OS aberta do quarto, se houver — usada pela trava da troca genérica de situação.
export async function findOpenTicketForRoom(db: Db, tenantId: string, roomId: string) {
  return db.maintenanceTicket.findFirst({
    where: { tenantId, roomId, stage: { in: OPEN_MAINTENANCE_STAGES } },
    select: { id: true, number: true, assignedEmployee: { select: { name: true } } },
  });
}
