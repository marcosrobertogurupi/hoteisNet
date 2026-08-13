import fs from "fs";
import path from "path";

const backupDir = "C:\\My Projects\\HoteisNet\\Exe\\Backup\\2026\\08\\05\\12-18\\196\\HoteisBD";
const sqlPath = "C:\\My Projects\\HoteisNet\\Exe\\ViaNorte\\BackupViaNorte.sql";

console.log("--- Checking BackupViaNorte.sql for Quarto & PLContas ---");
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, "utf-8");
  const lines = sql.split("\n");
  const quartoLines = lines.filter(l => l.toLowerCase().includes("into `quarto`"));
  const plLines = lines.filter(l => l.toLowerCase().includes("into `plcontas`") || l.toLowerCase().includes("into `despesa`"));
  console.log(`Found ${quartoLines.length} lines for quarto table in SQL.`);
  if (quartoLines.length > 0) {
    console.log("Sample quarto line:", quartoLines[0].substring(0, 300));
  }
  console.log(`Found ${plLines.length} lines for plcontas/despesa in SQL.`);
}


function analyzeFicBinary(filename: string) {
  const filePath = path.join(backupDir, filename);
  if (!fs.existsSync(filePath)) return;
  const buf = fs.readFileSync(filePath);
  console.log(`\n=================== BINARY ANALYSIS OF ${filename} (${buf.length} bytes) ===================`);

  // Search for readable ascii strings and their offsets
  let str = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if ((b >= 32 && b <= 126) || (b >= 192 && b <= 255)) {
      str += String.fromCharCode(b);
    } else {
      if (str.length >= 3) {
        console.log(`Offset 0x${(i - str.length).toString(16)} [${i - str.length}]: "${str}"`);
      }
      str = "";
    }
  }
}

function parsePLContas() {
  const filePath = path.join(backupDir, "PLContas.fic");
  if (!fs.existsSync(filePath)) return;
  const buf = fs.readFileSync(filePath);
  console.log(`\n=================== PARSING PLContas.fic ===================`);

  const text = buf.toString("latin1");
  const cnpj = "40904811000131";

  // Split by CNPJ or search for account codes matching standard patterns XX.XX.XX.XX
  const accountPattern = /\b(\d{2}\.\d{2}\.\d{2}\.\d{2})\b/g;
  let match;
  const accounts: { code: string; name: string }[] = [];

  while ((match = accountPattern.exec(text)) !== null) {
    const code = match[1];
    const offset = match.index + code.length;
    // Extract the description after the code
    const sub = text.substring(offset, offset + 100);
    // Description is the text before next null or non-printable character or CNPJ
    const nameMatch = sub.match(/[\x20-\x7E\xA0-\xFF]{2,}/);
    let name = nameMatch ? nameMatch[0].trim() : "";
    if (name.startsWith(cnpj)) {
      name = name.substring(cnpj.length).trim();
    }
    accounts.push({ code, name });
  }

  console.log(`Found ${accounts.length} Plano de Contas records:`);
  console.table(accounts);
}

function parseApartamentos() {
  const filePath = path.join(backupDir, "Apartamentos.fic");
  if (!fs.existsSync(filePath)) return;
  const buf = fs.readFileSync(filePath);
  console.log(`\n=================== PARSING Apartamentos.fic ===================`);

  const str = buf.toString("latin1");
  const cnpj = "40904811000131";

  // Records contain CNPJ "40904811000131" followed by Room Number, Description, Status etc.
  const parts = str.split(cnpj);
  console.log(`Split by CNPJ yielded ${parts.length} segments.`);

  const rooms: any[] = [];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    // Find readable text strings in this segment
    const strings = seg.match(/[\x20-\x7E\xA0-\xFF]{1,}/g) || [];
    const cleanStrings = strings.map(s => s.trim()).filter(s => s.length > 0 && !/^[0-9A-F]{32}$/i.test(s));
    if (cleanStrings.length > 0) {
      rooms.push(cleanStrings);
    }
  }

  console.log(`Extracted ${rooms.length} apartment segments:`);
  rooms.forEach((r, idx) => {
    console.log(`[${idx + 1}]`, r);
  });
}

parseApartamentos();
parsePLContas();



