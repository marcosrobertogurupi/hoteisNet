import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Limpando observação padrão de governança gravada em rooms.notes...");

  const cleared = await prisma.room.updateMany({
    where: { notes: "Quarto Higienizado & Vistoriado" },
    data: { notes: null },
  });

  console.log(`✅ Quartos com a observação padrão removida: ${cleared.count}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro ao limpar observações padrão:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
