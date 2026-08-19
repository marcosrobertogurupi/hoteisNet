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
  const room = await tx.room.findFirst({
    where: { OR: [{ id: roomIdOrNumber }, { number: roomIdOrNumber }] },
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
