import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Aceita tanto o client Prisma completo quanto o client de dentro de uma `prisma.$transaction`
// (que não expõe $connect/$disconnect/$transaction/$extends) — as duas formas são usadas nas
// chamadas destas funções.
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

// Resolve o UUID real do quarto a partir de um id ou número; cria o quarto se não existir.
export async function resolveRoomId(
  tx: PrismaClientOrTx,
  roomIdOrNumber: string,
  tenantId: string
): Promise<string> {
  // Sempre restrito ao tenant informado — sem isso, um número de quarto comum (ex: "101") podia
  // resolver para o quarto de OUTRO hotel caso ele tivesse sido criado primeiro no banco, criando
  // reservas/edições cruzadas entre tenants diferentes.
  const room = await tx.room.findFirst({
    where: { OR: [{ id: roomIdOrNumber }, { number: roomIdOrNumber }], tenantId },
  });
  if (room) return room.id;

  const category = await tx.roomCategory.findFirst({ where: { tenantId } });
  const created = await tx.room.create({
    data: {
      number: String(roomIdOrNumber),
      floor: "1",
      status: "VACANT_CLEAN",
      tenantId,
      categoryId:
        category?.id ||
        (await tx.roomCategory.create({ data: { tenantId, name: "STANDARD", dailyPrice: 0, capacity: 2 } })).id,
    },
  });
  return created.id;
}

// Data-limite EFETIVA de ocupação de uma hospedagem: o maior valor entre a saída prevista e
// (check-in + diárias já lançadas). É a mesma régua que o Mapa de Reservas usa para desenhar a
// barra "EM VIGÊNCIA" (ver occupiedUntilDate em lib/mapQueries.ts, que delega para cá).
//
// Por que não confiar só em `expectedCheckOut`: um hóspede em overstay tem saída prevista no
// passado mas continua no quarto até a recepção finalizar a hospedagem, e o rollover automático de
// diárias empurra `dailiesCount` dia a dia. Um caso real: o agente de IA reservou um quarto para
// "hoje" porque a saída prevista da hospedagem em aberto já tinha passado (23/08), mesmo o hóspede
// ainda estando lá e o sistema já cobrando a 18ª diária.
export function stayOccupiedUntil(stay: {
  checkInDate: Date;
  expectedCheckOut: Date;
  dailiesCount: number;
}): Date {
  const billedThrough = new Date(stay.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stay.dailiesCount);
  return billedThrough > stay.expectedCheckOut ? billedThrough : stay.expectedCheckOut;
}

// Hospedagem em aberto (isClosed:false) que impede uma reserva nova para o período pedido.
// Diferente de findConflictingReservation (que olha a tabela de reservas), aqui a fonte é
// StayCheckin — e a checagem NUNCA usa `expectedCheckOut > checkIn` cru: usa stayOccupiedUntil,
// para pegar overstay. Bloqueia quando a hospedagem começou antes do checkOut pedido E sua
// ocupação efetiva alcança o checkIn pedido. Uma hospedagem que termina antes do período (hóspede
// sai antes da nova reserva começar) não bloqueia.
export async function findBlockingOpenStay(
  tx: PrismaClientOrTx,
  roomId: string,
  checkInDate: Date,
  checkOutDate: Date
) {
  const stays = await tx.stayCheckin.findMany({
    where: { roomId, isClosed: false, checkInDate: { lt: checkOutDate } },
    select: { id: true, checkInDate: true, expectedCheckOut: true, dailiesCount: true },
  });
  return stays.find((s) => stayOccupiedUntil(s) > checkInDate) ?? null;
}

// Verifica se existe alguma reserva ativa (não CANCELLED/CHECKED_OUT) sobrepondo o período
// informado para o quarto indicado. Usado tanto na criação individual quanto em lote, sempre
// dentro da própria transação Prisma, para que a checagem de conflito seja atômica e não apenas
// uma validação de UI — duas reservas do mesmo lote para o mesmo quarto também são pegas aqui,
// pois cada `create` anterior já fica visível para os `findFirst` seguintes dentro da mesma tx.
export async function findConflictingReservation(
  tx: PrismaClientOrTx,
  roomId: string,
  checkInDate: Date,
  checkOutDate: Date,
  excludeReservationId?: string
) {
  return tx.reservation.findFirst({
    where: {
      roomId,
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      status: { notIn: ["CANCELLED", "CHECKED_OUT"] },
      checkInDate: { lt: checkOutDate },
      checkOutDate: { gt: checkInDate },
    },
  });
}
