import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { busyRoomIdsForPeriod } from "@/lib/reservationHelpers";

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

// Horário padrão de check-in/out do hotel — mesma constante assumida em todo o sistema quando não
// há horário definido (ver apps/web/src/lib/aiAgent/tools.ts, CheckinHospedagemModal.tsx).
const DEFAULT_CHECK_IN_TIME = "14:00";
const DEFAULT_CHECK_OUT_TIME = "12:00";

// Ancora só a data (AAAA-MM-DD) no horário padrão do hotel, no fuso de Brasília (UTC-3 o ano todo —
// o Brasil não tem horário de verão desde 2019). Igual ao fluxo manual e ao do agente de IA — sem
// isso a comparação de período nasce à meia-noite UTC, que é 21h do dia anterior em BRT.
export function atBrasiliaTime(dateYmd: string, hhmm: string): Date {
  return new Date(`${dateYmd}T${hhmm}:00-03:00`);
}

export function waitlistCheckInAt(date: Date): Date {
  return atBrasiliaTime(date.toISOString().slice(0, 10), DEFAULT_CHECK_IN_TIME);
}
export function waitlistCheckOutAt(date: Date): Date {
  return atBrasiliaTime(date.toISOString().slice(0, 10), DEFAULT_CHECK_OUT_TIME);
}

// Procura um quarto ATIVO da categoria pedida que esteja genuinamente livre para todo o período
// da entrada da fila. Devolve `{ roomId }` do primeiro quarto livre, ou `null`.
//
// Regra travada com o usuário: a reserva tem prioridade absoluta sobre a fila. Um quarto só "casa"
// se nenhuma reserva ativa/futura (PRE_RESERVATION/CONFIRMED/CHECKED_IN) nem hospedagem em aberto
// o reivindica no período (busyRoomIdsForPeriod, a mesma régua do Mapa de Reservas). Além disso,
// quartos já em "soft hold" por outra entrada da fila já avisada (status NOTIFIED, notifiedRoomId
// preenchido, período sobreposto) também são excluídos — para o worker não oferecer o mesmo quarto
// a dois hóspedes da fila no mesmo ciclo. `excludeWaitlistId` é a própria entrada sendo avaliada
// (não deve competir consigo mesma numa reavaliação).
export async function findWaitlistVacancy(
  tx: PrismaClientOrTx,
  params: {
    tenantId: string;
    roomCategoryId: string;
    checkIn: Date;
    checkOut: Date;
    excludeWaitlistId?: string;
  }
): Promise<{ roomId: string } | null> {
  const checkIn = waitlistCheckInAt(params.checkIn);
  const checkOut = waitlistCheckOutAt(params.checkOut);
  if (checkOut <= checkIn) return null;

  const rooms = await tx.room.findMany({
    where: { tenantId: params.tenantId, categoryId: params.roomCategoryId, active: true },
    select: { id: true },
  });
  if (rooms.length === 0) return null;
  const roomIds = rooms.map((r) => r.id);

  const [busy, held] = await Promise.all([
    busyRoomIdsForPeriod(tx, roomIds, checkIn, checkOut),
    roomIdsHeldByOtherWaitlist(tx, {
      tenantId: params.tenantId,
      roomIds,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      excludeWaitlistId: params.excludeWaitlistId,
    }),
  ]);

  const free = roomIds.find((id) => !busy.has(id) && !held.has(id));
  return free ? { roomId: free } : null;
}

// Quartos (dentre os informados) em "soft hold" por OUTRA entrada da fila já avisada (status
// NOTIFIED, `notifiedRoomId` preenchido, período sobreposto) — ou seja, um quarto já prometido a
// outro hóspede da fila. `excludeWaitlistId` tira a própria entrada da conta (o hold dela não
// compete consigo mesma). Usado por `findWaitlistVacancy` e pela conversão, para a recepção nunca
// converter uma entrada usando o quarto reservado para quem já foi avisado antes.
export async function roomIdsHeldByOtherWaitlist(
  tx: PrismaClientOrTx,
  params: {
    tenantId: string;
    roomIds: string[];
    checkIn: Date;
    checkOut: Date;
    excludeWaitlistId?: string;
  }
): Promise<Set<string>> {
  if (params.roomIds.length === 0) return new Set();
  const checkIn = waitlistCheckInAt(params.checkIn);
  const checkOut = waitlistCheckOutAt(params.checkOut);
  const heldEntries = await tx.waitlistEntry.findMany({
    where: {
      tenantId: params.tenantId,
      status: "NOTIFIED",
      notifiedRoomId: { in: params.roomIds },
      id: params.excludeWaitlistId ? { not: params.excludeWaitlistId } : undefined,
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    select: { notifiedRoomId: true },
  });
  return new Set(heldEntries.map((e) => e.notifiedRoomId).filter(Boolean) as string[]);
}

// Quantas entradas da fila estão À FRENTE desta para a mesma categoria e um período sobreposto —
// isto é, entradas ainda `WAITING` criadas antes (`createdAt` menor) que disputam a mesma vaga.
// A regra travada com o usuário é "avisar o primeiro da fila (createdAt asc)"; avisar/converter
// alguém com gente na frente é "furar a fila" e só deve acontecer com confirmação explícita da
// recepção (e fica registrado na trilha de auditoria). Uma entrada à frente já `NOTIFIED` não
// entra nesta conta — ela é protegida pelo soft hold (`roomIdsHeldByOtherWaitlist`), não pela
// ordem.
export async function countWaitlistAhead(
  tx: PrismaClientOrTx,
  entry: {
    id: string;
    tenantId: string;
    roomCategoryId: string;
    checkInDate: Date;
    checkOutDate: Date;
    createdAt: Date;
  }
): Promise<{ count: number; nextGuestName: string | null }> {
  const ahead = await tx.waitlistEntry.findMany({
    where: {
      tenantId: entry.tenantId,
      status: "WAITING",
      roomCategoryId: entry.roomCategoryId,
      id: { not: entry.id },
      createdAt: { lt: entry.createdAt },
      checkInDate: { lt: entry.checkOutDate },
      checkOutDate: { gt: entry.checkInDate },
    },
    orderBy: { createdAt: "asc" },
    select: { guestName: true },
  });
  return { count: ahead.length, nextGuestName: ahead[0]?.guestName ?? null };
}
