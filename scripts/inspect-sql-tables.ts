import fs from "fs";

const sqlPath = "C:\\My Projects\\HoteisNet\\Exe\\ViaNorte\\BackupViaNorte.sql";

if (!fs.existsSync(sqlPath)) {
  console.log("BackupViaNorte.sql not found!");
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf-8");
const lines = sql.split("\n");

function findTableLines(tableName: string) {
  const matching = lines.filter(l => l.toLowerCase().includes(`into \`${tableName.toLowerCase()}\``) || l.toLowerCase().includes(`into ${tableName.toLowerCase()}`));
  console.log(`\n=== Table: ${tableName} (${matching.length} insert lines) ===`);
  if (matching.length > 0) {
    console.log("Sample insert line:", matching[0].substring(0, 400));
  }
}

findTableLines("fornecedor");
findTableLines("conveniada");
findTableLines("conveniados");
findTableLines("estoque");
findTableLines("tarifa");
findTableLines("formapagamento");
findTableLines("banco");
findTableLines("grupo");
