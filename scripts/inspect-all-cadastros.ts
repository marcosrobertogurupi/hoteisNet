import fs from "fs";
import path from "path";

const backupDir = "C:\\My Projects\\HoteisNet\\Exe\\Backup\\2026\\08\\05\\12-18\\196\\HoteisBD";

function inspectFic(filename: string) {
  const filePath = path.join(backupDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  const buf = fs.readFileSync(filePath);
  console.log(`\n=== ${filename} (Size: ${buf.length} bytes) ===`);
  const text = buf.toString("latin1");
  const matches = text.match(/[\x20-\x7E\xA0-\xFF]{3,}/g) || [];
  const clean = matches.filter(s => !/^[0-9A-F]{32}$/i.test(s) && s !== "PCS");
  console.log(`Found ${clean.length} clean text strings. First 40:`);
  console.log(clean.slice(0, 40));
}

inspectFic("FornecedorNet.fic");
inspectFic("TelFor.fic");
inspectFic("Empresas.fic");
inspectFic("Produtos.fic");
inspectFic("TarifasNet.fic");
