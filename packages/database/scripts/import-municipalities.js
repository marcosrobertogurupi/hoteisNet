/**
 * Importa o cadastro de municípios (nome + código IBGE + UF + DDD) da tabela CidadesNet do
 * sistema legado em WinDev para o model Municipality do projeto novo.
 *
 * A tabela CidadesNet é um arquivo binário HyperFileSQL Classic (.fic), sem ferramenta de
 * exportação disponível neste ambiente (WinDev/HFSQL não está instalado). Os registros têm
 * tamanho fixo (135 bytes) e layout determinado por engenharia reversa a partir do arquivo de
 * análise HoteisBD.xdd (que descreve os campos Cid_NOME, Cid_CodIBGE, Cid_DDD, Cid_UF) e
 * confirmado byte a byte comparando contra códigos IBGE reais conhecidos (ex: São Paulo
 * 3550308, Rio de Janeiro 3304557, Brasília 5300108) — todos batem exatamente.
 *
 * Uso: node scripts/import-municipalities.js
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FIC_PATH = path.resolve(
  __dirname,
  "../../../PROJETO WINDEV/BANCO/HoteisBD/CidadesNet.fic"
);

// Offset do primeiro registro e tamanho fixo de cada registro, determinados examinando o
// arquivo binário (o nome do primeiro município — "ALTA FLORESTA D'OESTE", RO — começa em
// 1805, e o espaçamento entre o início do nome de registros consecutivos é sempre 135 bytes).
const FIRST_OFFSET = 1805;
const STRIDE = 135;
const COUNT = 5570; // total de municípios brasileiros na tabela original — confirmado por
// (offset do último registro conhecido "BRASILIA"/DF, 753620 - FIRST_OFFSET) / STRIDE = 5569 (índice 0-based)

// Deslocamentos relativos dos campos dentro de cada registro de 135 bytes, também determinados
// por inspeção byte a byte (não documentados publicamente pela PCSoft):
const NOME_OFFSET = 0;
const NOME_SIZE = 100;
const CODIBGE_OFFSET = 101;
const CODIBGE_SIZE = 10;
const DDD_OFFSET = 112;
const DDD_SIZE = 2;
const UF_OFFSET = 115;
const UF_SIZE = 2;

// Primeiros 2 dígitos do código IBGE -> UF, usados só para VALIDAR cada registro extraído
// (se o UF lido no arquivo não bater com o prefixo do código IBGE lido, o registro é
// descartado por segurança em vez de importado com dado potencialmente corrompido).
const UF_BY_IBGE_PREFIX = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
  31: "MG", 32: "ES", 33: "RJ", 35: "SP",
  41: "PR", 42: "SC", 43: "RS",
  50: "MS", 51: "MT", 52: "GO", 53: "DF",
};

function readCString(slice) {
  const nul = slice.indexOf(0);
  const raw = nul === -1 ? slice : slice.subarray(0, nul);
  return raw.toString("latin1").trim();
}

function extract() {
  const buf = fs.readFileSync(FIC_PATH);
  const rows = [];
  const problems = [];

  for (let i = 0; i < COUNT; i++) {
    const start = FIRST_OFFSET + i * STRIDE;
    const record = buf.subarray(start, start + STRIDE);

    const nome = readCString(record.subarray(NOME_OFFSET, NOME_OFFSET + NOME_SIZE));
    const codIBGE = readCString(record.subarray(CODIBGE_OFFSET, CODIBGE_OFFSET + CODIBGE_SIZE));
    const ddd = readCString(record.subarray(DDD_OFFSET, DDD_OFFSET + DDD_SIZE));
    const uf = readCString(record.subarray(UF_OFFSET, UF_OFFSET + UF_SIZE));

    const isValidCode = /^\d{7}$/.test(codIBGE);
    const prefix = isValidCode ? Number(codIBGE.slice(0, 2)) : null;
    const expectedUf = prefix !== null ? UF_BY_IBGE_PREFIX[prefix] : null;

    if (!nome || !isValidCode || !expectedUf || expectedUf !== uf) {
      problems.push({ i, nome, codIBGE, ddd, uf });
      continue;
    }

    // Normaliza para maiúsculas — a fonte legada tem uma inconsistência de encoding em ~25% dos
    // registros onde só a letra acentuada (ã, á, ó...) fica em minúscula dentro de nomes
    // totalmente maiúsculos (ex: "SãO PAULO"), artefato de codepage do sistema original.
    rows.push({
      name: nome.toUpperCase(),
      ibgeCode: codIBGE,
      uf,
      dddCode: ddd || null,
    });
  }

  return { rows, problems };
}

async function main() {
  if (!fs.existsSync(FIC_PATH)) {
    console.error(`Arquivo não encontrado: ${FIC_PATH}`);
    process.exit(1);
  }

  const { rows, problems } = extract();
  console.log(`Extraídos ${rows.length} municípios de ${COUNT} esperados.`);
  if (problems.length) {
    console.warn(`${problems.length} registros descartados por falha de validação:`, problems.slice(0, 10));
  }

  const existing = await prisma.municipality.count();
  if (existing > 0) {
    console.log(`Municipality já tem ${existing} registros — apagando antes de reimportar.`);
    await prisma.municipality.deleteMany({});
  }

  const BATCH = 1000;
  let imported = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const result = await prisma.municipality.createMany({ data: batch, skipDuplicates: true });
    imported += result.count;
  }

  console.log(`Importação concluída: ${imported} municípios gravados.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Erro na importação:", err);
  await prisma.$disconnect();
  process.exit(1);
});
