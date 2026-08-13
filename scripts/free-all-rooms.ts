import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Executando liberação total de apartamentos no banco...");

  // 1. Fechar todas as hospedagens/check-ins ativas
  const closedCheckins = await prisma.stayCheckin.updateMany({
    where: { isClosed: false },
    data: {
      isClosed: true,
      actualCheckOut: new Date(),
    },
  });
  console.log(`✅ Hospedagens/Check-ins ativas encerradas: ${closedCheckins.count}`);

  // 2. Atualizar status de reservas ativas (CHECKED_IN) para CANCELLED
  const updatedReservations = await prisma.reservation.updateMany({
    where: {
      status: "CHECKED_IN",
    },
    data: {
      status: "CANCELLED",
    },
  });
  console.log(`✅ Reservas ativas atualizadas para CANCELLED: ${updatedReservations.count}`);

  // 3. Atualizar TODOS os 87 apartamentos para VACANT_CLEAN (Livre / Higienizado)
  const updatedRooms = await prisma.room.updateMany({
    data: {
      status: "VACANT_CLEAN",
      notes: "Quarto Higienizado & Vistoriado",
    },
  });
  console.log(`✅ Total de apartamentos atualizados para LIVRE / HIGIENIZADO: ${updatedRooms.count}`);

  // 4. Verificação Final de Status
  const statusCounts = await prisma.room.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  console.log("\n📊 Distribuição Atualizada de Status dos Quartos:");
  console.table(statusCounts.map(s => ({ Status: s.status, Quantidade: s._count.id })));
}

main()
  .catch((e) => {
    console.error("❌ Erro ao liberar quartos:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
