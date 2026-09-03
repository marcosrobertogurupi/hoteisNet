import { PrismaClient } from "@prisma/client";

// Backfill único e idempotente: cria um ProductGroup por valor distinto da coluna legada
// Product.category (por tenant) e vincula os produtos a ele (Product.groupId). Depois desta
// migração a classificação passa a vir da lista cadastrada, não mais do texto livre.
// Rodar: npx tsx scripts/backfill-product-groups.ts

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { groupId: null },
    select: { id: true, tenantId: true, category: true },
  });

  if (products.length === 0) {
    console.log("✅ Nada a fazer — todos os produtos já têm grupo.");
    return;
  }

  // Agrupa por tenant + nome de categoria (normalizado só para agrupar; o nome gravado é o 1º visto).
  const byTenant = new Map<string, Map<string, { display: string; ids: string[] }>>();
  for (const p of products) {
    const raw = (p.category || "").trim();
    const name = raw || "SEM GRUPO";
    const key = name.toUpperCase();
    if (!byTenant.has(p.tenantId)) byTenant.set(p.tenantId, new Map());
    const tMap = byTenant.get(p.tenantId)!;
    if (!tMap.has(key)) tMap.set(key, { display: name, ids: [] });
    tMap.get(key)!.ids.push(p.id);
  }

  let groupsCreated = 0;
  let productsLinked = 0;

  for (const [tenantId, tMap] of byTenant) {
    for (const { display, ids } of tMap.values()) {
      let group = await prisma.productGroup.findFirst({
        where: { tenantId, type: "PRODUTO", name: display },
        select: { id: true },
      });
      if (!group) {
        group = await prisma.productGroup.create({
          data: { tenantId, name: display, type: "PRODUTO", active: true },
          select: { id: true },
        });
        groupsCreated++;
      }
      const res = await prisma.product.updateMany({
        where: { id: { in: ids }, tenantId, groupId: null },
        data: { groupId: group.id, category: display },
      });
      productsLinked += res.count;
      console.log(`  tenant ${tenantId} · "${display}" → ${res.count} produto(s)`);
    }
  }

  console.log(`\n✅ Grupos criados: ${groupsCreated} · Produtos vinculados: ${productsLinked}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro no backfill:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
