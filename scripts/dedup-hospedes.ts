/**
 * Script para remover hóspedes duplicados do Supabase
 * Mantém apenas o registro com menor ID (primeiro inserido) por (tenantId + fullName + cpf)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function main() {
  console.log("🧹 Iniciando limpeza de duplicatas no Supabase...");

  const total = await prisma.guest.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  console.log(`📊 Total de hóspedes antes da limpeza: ${total}`);

  // Buscar todos os hóspedes agrupados por fullName + cpf
  const allGuests = await prisma.guest.findMany({
    where: { tenantId: DEFAULT_TENANT_ID },
    select: { id: true, fullName: true, cpf: true },
    orderBy: { fullName: "asc" },
  });

  const seen = new Map<string, string>(); // key -> primeiro id
  const toDelete: string[] = [];

  for (const guest of allGuests) {
    const key = `${guest.fullName}|${guest.cpf || "null"}`;
    if (seen.has(key)) {
      toDelete.push(guest.id);
    } else {
      seen.set(key, guest.id);
    }
  }

  console.log(`🗑️ Duplicatas encontradas: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log("✅ Nenhuma duplicata encontrada!");
    return;
  }

  // Deletar em lotes
  const BATCH = 200;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    await prisma.guest.deleteMany({ where: { id: { in: batch } } });
    console.log(`🗑️ Removidos ${Math.min(i + BATCH, toDelete.length)} de ${toDelete.length} duplicatas...`);
  }

  const finalTotal = await prisma.guest.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  console.log(`\n=======================================================`);
  console.log(`✅ Limpeza concluída!`);
  console.log(`📊 Total de hóspedes após limpeza: ${finalTotal}`);
  console.log(`🗑️ Duplicatas removidas: ${total - finalTotal}`);
  console.log(`=======================================================\n`);
}

main()
  .catch((e) => { console.error("Erro:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
