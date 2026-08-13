import fs from "fs";
import path from "path";

const sqlFilePath = path.join(
  process.cwd(),
  "PROJETO WINDEV",
  "Exe",
  "ViaNorte",
  "BackupViaNorte.sql"
);

const sqlContent = fs.readFileSync(sqlFilePath, "utf-8");
const lines = sqlContent.split("\n");

for (let lIdx = 0; lIdx < lines.length; lIdx++) {
  const line = lines[lIdx];
  if (line.toLowerCase().includes("into `hospede`")) {
    console.log(`Found hospede line at line ${lIdx + 1}, length: ${line.length}`);
    const valuesIdx = line.indexOf("values ");
    console.log(`valuesIdx: ${valuesIdx}`);
    if (valuesIdx !== -1) {
      const sampleStr = line.substring(valuesIdx + 7, valuesIdx + 500);
      console.log(`Sample values string: ${sampleStr}`);
    }
  }
}
