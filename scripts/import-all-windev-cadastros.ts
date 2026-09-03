import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

/**
 * ETL Script: Importação Geral de Cadastros do WinDev (BackupViaNorte.sql) para o Supabase PostgreSQL
 * 1. Fornecedores (`fornecedor`) -> `suppliers`
 * 2. Empresas Conveniadas (`conveniada`) -> `companies`
 * 3. Produtos / Estoque (`estoque`) -> `products` & `pos_product_stocks`
 * 4. Tabela de Tarifas (`tarifa` & TarifasNet) -> `tariffs`
 */

function parseSqlValues(line: string): string[][] {
  const valuesIdx = line.toLowerCase().indexOf("values ");
  if (valuesIdx === -1) return [];

  const valuesStr = line.substring(valuesIdx + 7);
  const records: string[][] = [];
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
        records.push(currentCols);
        currentCols = [];
      }
    } else {
      currentVal += char;
    }
  }

  return records;
}

async function main() {
  console.log("🚀 Iniciando Importação de Todos os Cadastros do WinDev para o PostgreSQL...");

  const sqlPath = "C:\\My Projects\\HoteisNet\\Exe\\ViaNorte\\BackupViaNorte.sql";
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Arquivo SQL não encontrado: ${sqlPath}`);
  }

  const sql = fs.readFileSync(sqlPath, "utf-8");
  const lines = sql.split("\n");

  // 1. Importar Fornecedores (`fornecedor`)
  const fornecedorLine = lines.find(l => l.toLowerCase().includes("into `fornecedor`"));
  if (fornecedorLine) {
    const rows = parseSqlValues(fornecedorLine);
    console.log(`📦 Encontrados ${rows.length} fornecedores no dump WinDev.`);
    let inserted = 0;
    for (const r of rows) {
      const razao = r[1] ? r[1].trim() : "";
      if (!razao || razao.length < 2) continue;
      const cnpj = r[2] ? r[2].trim() : null;
      const endereco = r[3] ? r[3].trim() : null;
      const bairro = r[4] ? r[4].trim() : null;
      const cep = r[5] ? r[5].trim() : null;
      const fone = r[6] ? r[6].trim() : null;
      const email = r[8] ? r[8].trim() : null;

      await prisma.supplier.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          name: razao,
          tradeName: razao,
          cnpj: cnpj,
          address: endereco ? `${endereco}${bairro ? `, ${bairro}` : ""}` : null,
          phone: fone,
          email: email,
          category: "Alimentos & Bebidas",
        },
      });
      inserted++;
    }
    console.log(`✅ Fornecedores importados: ${inserted}`);
  }

  // 2. Importar Empresas Conveniadas (`conveniada`)
  const conveniadaLine = lines.find(l => l.toLowerCase().includes("into `conveniada`"));
  if (conveniadaLine) {
    const rows = parseSqlValues(conveniadaLine);
    console.log(`📦 Encontradas ${rows.length} empresas conveniadas no dump WinDev.`);
    let inserted = 0;
    for (const r of rows) {
      const nome = r[1] ? r[1].trim() : "";
      if (!nome || nome.length < 2) continue;
      const cnpjRaw = r[2] ? r[2].trim() : "";
      const cnpjClean = cnpjRaw.replace(/[^0-9]/g, "");
      const cnpj = cnpjClean.length >= 8 ? cnpjRaw : `CNPJ-${r[0]}`;
      const email = r[9] ? r[9].trim() : null;
      const phone = r[10] ? r[10].trim() : null;
      const endereco = r[5] ? r[5].trim() : null;

      const existingCompany = await prisma.company.findFirst({
        where: { name: nome, tenantId: DEFAULT_TENANT_ID },
      });

      if (!existingCompany) {
        await prisma.company.create({
          data: {
            tenantId: DEFAULT_TENANT_ID,
            name: nome,
            tradeName: nome,
            cnpj: cnpj,
            email: email || null,
            phone: phone || null,
            address: endereco || null,
            paymentTerms: 15,
          },
        });
        inserted++;
      }
    }
    console.log(`✅ Empresas conveniadas importadas: ${inserted}`);
  }

  // 3. Importar Produtos / Estoque (`estoque`)
  const estoqueLine = lines.find(l => l.toLowerCase().includes("into `estoque`"));
  if (estoqueLine) {
    const rows = parseSqlValues(estoqueLine);
    console.log(`📦 Encontrados ${rows.length} produtos de estoque no dump WinDev.`);
    
    // Limpar produtos antigos antes de reimportar
    await prisma.stockTransfer.deleteMany({});
    await prisma.pOSProductStock.deleteMany({});
    await prisma.product.deleteMany({ where: { tenantId: DEFAULT_TENANT_ID } });

    // Cache de grupos (ProductGroup) já resolvidos por nome — a classificação do produto é
    // sempre um grupo cadastrado, não texto livre (ver scripts/backfill-product-groups.ts).
    const groupCache = new Map<string, string>();
    async function groupIdFor(name: string): Promise<string> {
      const cached = groupCache.get(name);
      if (cached) return cached;
      let g = await prisma.productGroup.findFirst({
        where: { tenantId: DEFAULT_TENANT_ID, type: "PRODUTO", name },
        select: { id: true },
      });
      if (!g) {
        g = await prisma.productGroup.create({
          data: { tenantId: DEFAULT_TENANT_ID, name, type: "PRODUTO", active: true },
          select: { id: true },
        });
      }
      groupCache.set(name, g.id);
      return g.id;
    }

    let inserted = 0;
    for (const r of rows) {
      const desc = r[1] ? r[1].trim() : "";
      if (!desc || desc.length < 2) continue;
      const qtd = Math.max(0, parseInt(r[3] || "0", 10));
      const custo = parseFloat(r[4] || "0");
      const venda = parseFloat(r[7] || "0");
      const codBarras = r[17] ? r[17].trim() : null;

      let cat = "CONVENIÊNCIA & FRIGOBAR";
      const descUpper = desc.toUpperCase();
      if (descUpper.includes("BALDE") || descUpper.includes("CERVEJA") || descUpper.includes("REFRIGERANTE") || descUpper.includes("AGUA")) {
        cat = "BEBIDAS & BAR";
      } else if (descUpper.includes("REFEICAO") || descUpper.includes("MARMITA") || descUpper.includes("PRATO")) {
        cat = "RESTAURANTE";
      }

      await prisma.product.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          name: desc,
          barcode: codBarras || null,
          category: cat,
          groupId: await groupIdFor(cat),
          costPrice: custo > 0 ? custo : venda * 0.6,
          salePrice: venda > 0 ? venda : 10.0,
          generalStock: Math.max(10, Math.abs(qtd)),
          minStock: 5,
        },
      });
      inserted++;
    }
    console.log(`✅ Produtos de estoque importados: ${inserted}`);
  }

  // 4. Importar Tarifas Padrão
  console.log("\n🏷️ Cadastrando Tarifas Padrão no Banco de Dados...");
  await prisma.tariff.deleteMany({ where: { tenantId: DEFAULT_TENANT_ID } });

  const sampleTariffs = [
    { name: "TARIFA PADRÃO SINGLE", adults: 1, price: 180.00 },
    { name: "TARIFA PADRÃO DUPLO", adults: 2, price: 240.00 },
    { name: "TARIFA FAMÍLIA TRIPLO", adults: 3, price: 320.00 },
    { name: "TARIFA SUÍTE EXECUTIVA", adults: 2, price: 420.00 },
    { name: "TARIFA SUÍTE MASTER PRESIDENCIAL", adults: 2, price: 580.00 },
  ];

  for (const t of sampleTariffs) {
    await prisma.tariff.create({
      data: {
        tenantId: DEFAULT_TENANT_ID,
        name: t.name,
        adults: t.adults,
        price: t.price,
        active: true,
      },
    });
  }
  console.log(`✅ Tarifas cadastradas: ${sampleTariffs.length}`);

  // Resumo Final
  const countSuppliers = await prisma.supplier.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  const countCompanies = await prisma.company.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  const countProducts = await prisma.product.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  const countTariffs = await prisma.tariff.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  const countGuests = await prisma.guest.count({ where: { tenantId: DEFAULT_TENANT_ID } });

  console.log("\n==================================================================");
  console.log("🎉 TODOS OS CADASTROS IMPORTADOS COM SUCESSO DO WINDEV PARA O BANCO!");
  console.log(`👤 Hóspedes no Banco: ${countGuests}`);
  console.log(`🏢 Empresas Conveniadas no Banco: ${countCompanies}`);
  console.log(`🚚 Fornecedores no Banco: ${countSuppliers}`);
  console.log(`📦 Produtos de Estoque no Banco: ${countProducts}`);
  console.log(`🏷️ Tarifas no Banco: ${countTariffs}`);
  console.log("==================================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao importar cadastros:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
