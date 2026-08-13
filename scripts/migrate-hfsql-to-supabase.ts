import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * HoteisNet PMS SaaS - HFSQL WinDev to Supabase PostgreSQL Data Migration Tool
 * 
 * Script para processar arquivos CSV/JSON exportados do HFSQL (WinDev 25)
 * localizados em PROJETO WINDEV/BANCO/HoteisBD/ e inserir no Supabase.
 */

async function main() {
  console.log("🚀 Iniciando Migração de Dados do HFSQL (WinDev 25) para o Supabase PostgreSQL...");

  const dataDir = path.join(process.cwd(), "PROJETO WINDEV", "BANCO", "HoteisBD");

  // Check directory existence
  if (!fs.existsSync(dataDir)) {
    console.error(`❌ Diretório HFSQL não encontrado em ${dataDir}`);
    return;
  }

  console.log(`📂 Pasta de dados HFSQL identificada: ${dataDir}`);

  // 1. Migração de Empresas (Empresas.fic -> companies)
  const empresasCsvPath = path.join(dataDir, "Empresas.csv");
  if (fs.existsSync(empresasCsvPath)) {
    console.log("📦 Importando Empresas Conveniadas (Empresas.fic)...");
    const content = fs.readFileSync(empresasCsvPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map((c) => c.replace(/"/g, "").trim());
      const [id, razao, fantasia, cnpj, email, telefone] = cols;

      if (cnpj) {
        await prisma.company.upsert({
          where: { cnpj },
          update: { name: razao, tradeName: fantasia, email, phone: telefone },
          create: {
            tenantId: "TENANT_DEFAULT_ID",
            name: razao || "Empresa Conveniada",
            tradeName: fantasia || razao,
            cnpj: cnpj,
            email: email || null,
            phone: telefone || null,
          },
        });
      }
    }
    console.log("✅ Empresas migradas com sucesso!");
  }

  // 2. Migração de Hóspedes (HospedeNet.fic -> guests)
  const hospedesCsvPath = path.join(dataDir, "HospedeNet.csv");
  if (fs.existsSync(hospedesCsvPath)) {
    console.log("👤 Importando Cadastro de Hóspedes (HospedeNet.fic)...");
    const content = fs.readFileSync(hospedesCsvPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map((c) => c.replace(/"/g, "").trim());
      const [id, nome, cpf, rg, passaporte, telefone, email, cidade, uf] = cols;

      if (nome) {
        await prisma.guest.create({
          data: {
            tenantId: "TENANT_DEFAULT_ID",
            fullName: nome,
            cpf: cpf || null,
            passport: passaporte || null,
            phone: telefone || null,
            email: email || null,
            city: cidade || null,
            state: uf || null,
          },
        });
      }
    }
    console.log("✅ Hóspedes migrados com sucesso!");
  }

  console.log("🎉 Processo de ETL concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("Erro na migração:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
