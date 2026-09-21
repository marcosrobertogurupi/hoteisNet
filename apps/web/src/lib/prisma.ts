import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrisma> };

// `Room.photos` NUNCA vem por padrão: é o campo mais pesado do banco (fotos do quarto) e qualquer
// leitura "de linha inteira" (`findMany()` pelado, `include: { room: true }`, `include: { category: true }`
// a partir de Room) o arrastava junto — a cada tique de polling e a cada chamada do agente de IA.
// Quem realmente precisa das fotos pede explicitamente: `select: { photos: true }`.
function createPrisma() {
  return new PrismaClient({ omit: { room: { photos: true } } });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
