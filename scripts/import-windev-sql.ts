import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

/**
 * HoteisNet PMS SaaS - WinDev (BackupViaNorte.sql) ➔ Supabase PostgreSQL ETL Tool
 */

async function main() {
  console.log("🚀 Iniciando Importação em Lote do WinDev para o Supabase (HoteisNetSaaS)...");

  // 1. Criar ou Obter o Tenant Padrão (Sol & Mar)
  let tenant = await prisma.tenant.findUnique({
    where: { id: DEFAULT_TENANT_ID },
  });

  if (!tenant) {
    console.log("🏢 Criando Tenant Padrão de Demonstração (tenant-hoteisnet-demo)...");
    tenant = await prisma.tenant.create({
      data: {
        id: DEFAULT_TENANT_ID,
        name: "Hotel Pousada Sol & Mar",
        tradeName: "HoteisNet PMS SaaS Operacional",
        cnpj: "12345678000199",
        status: "ACTIVE",
        email: "gerencia@hoteisnet.com.br",
        phone: "(31) 99887-6655",
        city: "Belo Horizonte",
        state: "MG",
      },
    });
    console.log("✅ Tenant Padrão criado com sucesso!");
  }

  // 2. Criar Categoria e Apartamentos se ainda não existirem
  const roomCount = await prisma.room.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  if (roomCount === 0) {
    console.log("🛏️ Criando Categorias e Apartamentos Padrão no Supabase...");
    let category = await prisma.roomCategory.findFirst({ where: { tenantId: DEFAULT_TENANT_ID } });
    if (!category) {
      category = await prisma.roomCategory.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          name: "Standard Sol & Mar",
          description: "Apartamento Standard completo com Ar, TV, Minibar e Wi-Fi",
          dailyPrice: 180.00,
          capacity: 3,
        },
      });
    }

    const sampleRooms = [
      { number: "101", floor: "1º Andar", status: "VACANT_CLEAN" },
      { number: "102", floor: "1º Andar", status: "OCCUPIED" },
      { number: "103", floor: "1º Andar", status: "VACANT_DIRTY" },
      { number: "201", floor: "2º Andar", status: "VACANT_CLEAN" },
      { number: "202", floor: "2º Andar", status: "VACANT_CLEAN" },
    ];

    for (const r of sampleRooms) {
      await prisma.room.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          categoryId: category.id,
          number: r.number,
          floor: r.floor,
          status: r.status as any,
        },
      });
    }
    console.log("✅ Apartamentos cadastrados no Supabase com sucesso!");
  }

  // 3. Ler e Processar o SQL Dump do WinDev (BackupViaNorte.sql)
  const sqlFilePath = path.join(
    process.cwd(),
    "PROJETO WINDEV",
    "Exe",
    "ViaNorte",
    "BackupViaNorte.sql"
  );

  if (!fs.existsSync(sqlFilePath)) {
    console.error(`❌ Arquivo SQL não encontrado em: ${sqlFilePath}`);
    return;
  }

  console.log(`📂 Lendo dump do banco WinDev (${(fs.statSync(sqlFilePath).size / (1024 * 1024)).toFixed(2)} MB)...`);
  const sqlContent = fs.readFileSync(sqlFilePath, "utf-8");
  const lines = sqlContent.split("\n");

  let batch: any[] = [];
  let totalInserted = 0;

  for (const line of lines) {
    if (line.toLowerCase().includes("into `hospede`")) {
      const valuesIdx = line.toLowerCase().indexOf("values ");
      if (valuesIdx === -1) continue;

      const valuesStr = line.substring(valuesIdx + 7);
      let inStr = false;
      let currentVal = "";
      let currentCols: string[] = [];

      for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];
        const prev = i > 0 ? valuesStr[i - 1] : "";

        if (char === "'" && prev !== "\\") {
          inStr = !inStr;
        } else if (!inStr && char === "(") {
          currentCols = [];
          currentVal = "";
        } else if (!inStr && (char === "," || char === ")")) {
          const cleanVal = currentVal.trim().replace(/^'|'$/g, "").replace(/\\'/g, "'");
          currentCols.push(cleanVal === "NULL" ? "" : cleanVal);
          currentVal = "";

          if (char === ")") {
            if (currentCols.length >= 20) {
              const nome = currentCols[0] ? currentCols[0].trim() : "";
              const doc = currentCols[1] ? currentCols[1].trim() : "";
              const cpfRaw = currentCols[40] || doc || "";
              const cpf = cpfRaw.replace(/[^0-9.-]/g, "").substring(0, 20);
              const email = currentCols[8] && currentCols[8].includes("@") && !currentCols[8].includes("*") ? currentCols[8].trim() : null;
              const phone = currentCols[5] || currentCols[4] || null;
              const street = currentCols[2] || null;
              const zipCode = currentCols[3] || null;
              const gender = currentCols[20] === "F" ? "F" : "M";

              if (nome && nome.length >= 3) {
                batch.push({
                  tenantId: DEFAULT_TENANT_ID,
                  fullName: nome,
                  cpf: cpf || null,
                  email: email,
                  phone: phone ? phone.trim() : null,
                  whatsappPhone: phone ? phone.trim() : null,
                  hasWhatsapp: !!phone,
                  street: street,
                  zipCode: zipCode,
                  gender: gender,
                  country: "Brasil",
                });
              }
            }

            if (batch.length >= 500) {
              await prisma.guest.createMany({
                data: batch,
                skipDuplicates: true,
              });
              totalInserted += batch.length;
              console.log(`👤 Importados ${totalInserted} hóspedes no Supabase...`);
              batch = [];
            }

            currentCols = [];
          }
        } else {
          currentVal += char;
        }
      }
    }
  }

  if (batch.length > 0) {
    await prisma.guest.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalInserted += batch.length;
    console.log(`👤 Importados ${totalInserted} hóspedes no Supabase...`);
  }

  const finalGuestCount = await prisma.guest.count();
  const finalRoomCount = await prisma.room.count();

  console.log("\n=======================================================");
  console.log("🎉 MIGRAÇÃO REAL CONCLUÍDA COM SUCESSO NO SUPABASE!");
  console.log(`📊 Total de Hóspedes Ativos no Supabase: ${finalGuestCount}`);
  console.log(`📊 Total de Quartos/Apartamentos no Supabase: ${finalRoomCount}`);
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("Erro na importação:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
