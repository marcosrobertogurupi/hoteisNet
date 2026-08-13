import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.room.count();
  console.log("Total de apartamentos no banco PostgreSQL:", count);
  const sample = await prisma.room.findMany({
    select: { number: true, notes: true, category: { select: { name: true } } },
    orderBy: { number: "asc" },
    take: 10,
  });
  console.log("Amostra dos 10 primeiros apartamentos:", sample);
}

main().finally(async () => {
  await prisma.$disconnect();
});
