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

let totalGuests = 0;

for (const line of lines) {
  if (line.toLowerCase().includes("into `hospede`")) {
    const valuesIdx = line.toLowerCase().indexOf("values ");
    if (valuesIdx === -1) continue;

    const valuesStr = line.substring(valuesIdx + 7);
    
    // Split by tuple pattern: "),(" or end
    // Each record is enclosed in (...)
    let inStr = false;
    let currentVal = "";
    let currentCols: string[] = [];
    let lineGuests = 0;

    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];
      const prev = i > 0 ? valuesStr[i - 1] : "";

      if (char === "'" && prev !== "\\") {
        inStr = !inStr;
      } else if (!inStr && char === "(" && currentCols.length === 0) {
        currentCols = [];
        currentVal = "";
      } else if (!inStr && (char === "," || char === ")")) {
        if (char === ")" && currentVal === "" && currentCols.length === 0) continue;
        currentCols.push(currentVal.trim().replace(/^'|'$/g, "").replace(/\\'/g, "'"));
        currentVal = "";
        if (char === ")") {
          if (currentCols.length >= 20) {
            lineGuests++;
          }
          currentCols = [];
        }
      } else {
        currentVal += char;
      }
    }

    console.log(`Line parsed: ${lineGuests} guests found.`);
    totalGuests += lineGuests;
  }
}

console.log(`Total Hóspedes parsed: ${totalGuests}`);
