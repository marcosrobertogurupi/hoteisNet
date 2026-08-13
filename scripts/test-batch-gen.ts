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

let batch: any[] = [];
let validNames = 0;

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
            if (nome && nome.length >= 3) {
              validNames++;
              batch.push({
                fullName: nome,
                cpf: currentCols[40] || currentCols[1] || null,
              });
            }
          }
          currentCols = [];
        }
      } else {
        currentVal += char;
      }
    }
  }
}

console.log(`Valid guest names parsed: ${validNames}, Batch length: ${batch.length}`);
console.log("First 5 guests parsed:", batch.slice(0, 5));
