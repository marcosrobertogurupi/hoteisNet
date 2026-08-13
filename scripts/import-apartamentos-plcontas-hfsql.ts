import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BACKUP_DIR = "C:\\My Projects\\HoteisNet\\Exe\\Backup\\2026\\08\\05\\12-18\\196\\HoteisBD";
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

/**
 * Script de ETL HoteisNet PMS SaaS:
 * 1. Delete todos os apartamentos (rooms) e categorias (room_categories)
 * 2. Delete todos os planos de contas (account_plans)
 * 3. Importa todos os apartamentos do backup WinDev HFSQL (Apartamentos.fic & CategoriaApto.fic)
 * 4. Importa todos os planos de contas do backup WinDev HFSQL (PLContas.fic)
 */
async function main() {
  console.log("🚀 Iniciando procedimento no banco de dados SaaS...");

  // 1. Obter ou Garantir o Tenant Padrão
  let tenant = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
  if (!tenant) {
    tenant = await prisma.tenant.findFirst();
  }
  const tenantId = tenant ? tenant.id : DEFAULT_TENANT_ID;
  console.log(`🏢 Tenant identificado para o procedimento: ${tenantId} (${tenant?.name || "Sol & Mar"})`);

  // 2. Limpeza do Banco (Exclusão dos apartamentos e planos de contas antigos)
  console.log("\n🗑️ Executando exclusão de cadastros existentes...");
  
  // Limpar dependências de StayCheckin e Reservation se existirem referentes aos quartos antigos
  await prisma.stayConsumption.deleteMany({});
  await prisma.stayCheckin.deleteMany({});
  await prisma.reservation.deleteMany({});
  
  const deletedRooms = await prisma.room.deleteMany({});
  console.log(`✅ Apartamentos deletados: ${deletedRooms.count}`);

  const deletedCategories = await prisma.roomCategory.deleteMany({});
  console.log(`✅ Categorias de apartamentos deletadas: ${deletedCategories.count}`);

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "account_plans" WHERE "tenantId" = $1`, tenantId);
    console.log("✅ Planos de contas deletados com sucesso!");
  } catch (err: any) {
    console.log("⚠️ Tabela account_plans já está limpa ou:", err.message);
  }

  // 3. Importar Categorias de Apartamento
  console.log("\n🛏️ Importando Categorias de Apartamento do WinDev HFSQL...");
  
  const categorySpecs: { name: string; dailyPrice: number; capacity: number; description: string }[] = [
    { name: "STANDARD", dailyPrice: 180.00, capacity: 2, description: "Apartamento Standard completo com Ar, TV e Wi-Fi" },
    { name: "LUXO", dailyPrice: 260.00, capacity: 3, description: "Suíte Luxo com Varanda e Frigobar" },
    { name: "ESPECIAL", dailyPrice: 350.00, capacity: 4, description: "Suíte Especial Família com Vista" },
    { name: "SUITE MASTER", dailyPrice: 480.00, capacity: 4, description: "Suíte Master Presidencial com Hidro" },
    { name: "AUDITORIO", dailyPrice: 900.00, capacity: 100, description: "Auditório e Centro de Convenções" },
  ];

  const categoryMap = new Map<string, string>();

  for (const spec of categorySpecs) {
    const createdCat = await prisma.roomCategory.create({
      data: {
        tenantId,
        name: spec.name,
        dailyPrice: spec.dailyPrice,
        capacity: spec.capacity,
        description: spec.description,
      },
    });
    categoryMap.set(spec.name, createdCat.id);
  }

  console.log(`✅ Created ${categoryMap.size} categorias de apartamento!`);

  // 4. Ler e Importar Apartamentos de Apartamentos.fic
  const aptoFicPath = path.join(BACKUP_DIR, "Apartamentos.fic");
  if (!fs.existsSync(aptoFicPath)) {
    throw new Error(`Arquivo não encontrado: ${aptoFicPath}`);
  }

  console.log(`\n📂 Processando ${aptoFicPath}...`);
  const bufApto = fs.readFileSync(aptoFicPath);
  const strApto = bufApto.toString("latin1");
  const cnpj = "40904811000131";

  const aptoSegments = strApto.split(cnpj);
  const parsedRooms: { number: string; description: string; status: any; floor: string; categoryName: string }[] = [];

  const seenNumbers = new Set<string>();

  for (let i = 1; i < aptoSegments.length; i++) {
    const seg = aptoSegments[i];
    const strings = (seg.match(/[\x20-\x7E\xA0-\xFF]{1,}/g) || [])
      .map(s => s.trim())
      .filter(s => s.length > 0 && !/^[0-9A-F]{32}$/i.test(s));

    if (strings.length >= 1) {
      const roomNum = strings[0];

      // Ignorar strings espúrias de WhatsApp ou hashes
      if (!roomNum || roomNum.includes("@") || roomNum.length > 15 || seenNumbers.has(roomNum)) {
        continue;
      }

      seenNumbers.add(roomNum);

      let desc = strings.length >= 2 && !strings[1].includes("@") ? strings[1] : "Apartamento Standard";
      let statusStr = strings.find(s => s === "Ocupado" || s === "Limpeza" || s === "Desocupado") || "Desocupado";

      let status = "VACANT_CLEAN";
      if (statusStr === "Ocupado") status = "OCCUPIED";
      else if (statusStr === "Limpeza") status = "VACANT_DIRTY";

      // Determinar andar
      let floor = "Térreo";
      const numVal = parseInt(roomNum, 10);
      if (!isNaN(numVal)) {
        if (numVal >= 100 && numVal < 200) floor = "1º Andar";
        else if (numVal >= 200 && numVal < 300) floor = "2º Andar";
        else if (numVal >= 300 && numVal < 400) floor = "3º Andar";
        else if (numVal >= 400) floor = "4º Andar";
      } else if (roomNum === "AUDITORIO") {
        floor = "Térreo / Eventos";
      }

      // Determinar categoria
      let catName = "STANDARD";
      const descUpper = desc.toUpperCase();
      if (roomNum === "AUDITORIO") catName = "AUDITORIO";
      else if (descUpper.includes("CASAL + 2") || descUpper.includes("CASA + 2")) catName = "ESPECIAL";
      else if (descUpper.includes("LUXO") || descUpper.includes("MASTER")) catName = "LUXO";

      parsedRooms.push({
        number: roomNum,
        description: desc,
        status,
        floor,
        categoryName: catName,
      });
    }
  }

  console.log(`📦 Encontrados ${parsedRooms.length} apartamentos no backup HFSQL.`);

  let importedRoomsCount = 0;
  for (const r of parsedRooms) {
    const categoryId = categoryMap.get(r.categoryName) || categoryMap.get("STANDARD")!;
    await prisma.room.create({
      data: {
        tenantId,
        categoryId,
        number: r.number,
        floor: r.floor,
        status: r.status as any,
        notes: r.description,
      },
    });
    importedRoomsCount++;
  }

  console.log(`✅ Importação de Apartamentos concluída com sucesso! Total: ${importedRoomsCount}`);

  // 5. Ler e Importar Plano de Contas de PLContas.fic
  const plFicPath = path.join(BACKUP_DIR, "PLContas.fic");
  if (!fs.existsSync(plFicPath)) {
    throw new Error(`Arquivo não encontrado: ${plFicPath}`);
  }

  console.log(`\n📂 Processando ${plFicPath}...`);
  const bufPl = fs.readFileSync(plFicPath);
  const textPl = bufPl.toString("latin1");

  const accountPattern = /\b(\d{2}\.\d{2}\.\d{2}\.\d{2})\b/g;
  let match;
  const accounts: { code: string; name: string; type: string; level: string }[] = [];
  const seenCodes = new Set<string>();

  while ((match = accountPattern.exec(textPl)) !== null) {
    const code = match[1];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const offset = match.index + code.length;
    const sub = textPl.substring(offset, offset + 100);
    const nameMatch = sub.match(/[\x20-\x7E\xA0-\xFF]{2,}/);
    let name = nameMatch ? nameMatch[0].trim() : "";
    if (name.startsWith(cnpj)) {
      name = name.substring(cnpj.length).trim();
    }
    if (!name) name = "Conta " + code;

    const type = code.startsWith("02") ? "RECEITA" : "DESPESA";
    const level = code.endsWith(".00.00") || code.endsWith(".00.00.00") ? "Sintética" : "Analítica";

    accounts.push({ code, name, type, level });
  }

  console.log(`📦 Encontradas ${accounts.length} contas financeiras no backup HFSQL.`);

  let importedAccountsCount = 0;
  for (const acc of accounts) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "account_plans" ("id", "tenantId", "code", "description", "type", "level", "active", "createdAt", "updatedAt") 
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT ("tenantId", "code") DO UPDATE SET "description" = $3, "type" = $4, "level" = $5`,
      tenantId,
      acc.code,
      acc.name,
      acc.type,
      acc.level
    );
    importedAccountsCount++;
  }

  console.log(`✅ Importação de Plano de Contas concluída com sucesso! Total: ${importedAccountsCount}`);

  // 6. Resumo Final
  const finalRoomCount = await prisma.room.count({ where: { tenantId } });
  const finalAccountCountResult: any[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as count FROM "account_plans" WHERE "tenantId" = $1`, tenantId
  );
  const finalAccountCount = finalAccountCountResult[0]?.count || 0;

  console.log("\n==================================================================");
  console.log("🎉 PROCEDIMENTO CONCLUÍDO COM SUCESSO NO BANCO DE DADOS SAAS!");
  console.log(`🏢 Tenant: ${tenantId}`);
  console.log(`🛏️ Total de Apartamentos Ativos no Banco: ${finalRoomCount}`);
  console.log(`📊 Total de Contas no Plano de Contas: ${finalAccountCount}`);
  console.log("==================================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao executar o procedimento:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
