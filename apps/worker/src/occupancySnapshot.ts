import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Quartos nesses status contam como "ocupados" para a taxa de ocupação — mesma
// definição usada no Mapa de Quartos do frontend (ver counts.OCCUPIED em apps/web/src/app/app/page.tsx).
const OCCUPIED_STATUSES = ["OCCUPIED", "OCCUPIED_CLEANING"];

/**
 * Roda a cada hora (agendado em index.ts). Para cada assinante (tenant), calcula a
 * taxa de ocupação atual — ocupados / total de quartos ativos — e grava um snapshot
 * em RoomOccupancySnapshot, formando um histórico usado para estatística de vacância.
 * Tenants sem nenhum quarto ativo cadastrado não geram snapshot (divisão por zero).
 */
export async function runOccupancySnapshot(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const rooms = await prisma.room.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { status: true },
    });

    if (rooms.length === 0) continue;

    const occupiedRooms = rooms.filter((r) => OCCUPIED_STATUSES.includes(r.status)).length;
    const occupancyRate = (occupiedRooms / rooms.length) * 100;

    await prisma.roomOccupancySnapshot.create({
      data: {
        tenantId: tenant.id,
        totalRooms: rooms.length,
        occupiedRooms,
        occupancyRate,
      },
    });

    console.log(
      `[occupancy] tenant=${tenant.name} ocupados=${occupiedRooms}/${rooms.length} (${occupancyRate.toFixed(1)}%)`
    );
  }
}
