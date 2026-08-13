import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "PROJETO WINDEV", "BANCO", "HoteisBD");

function inspectFile(filename: string) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  const buffer = fs.readFileSync(filePath);
  console.log(`=== ${filename} === Size: ${buffer.length} bytes`);
  
  // Convert buffer to text filtering readable strings
  const str = buffer.toString("binary");
  // Find printable text sequences
  const matches = str.match(/[\x20-\x7E\xA0-\xFF]{4,}/g) || [];
  console.log(`Found ${matches.length} text fragments. Top 20 fragments:`);
  console.log(matches.slice(0, 30));
}

inspectFile("Empresas.fic");
inspectFile("Apartamentos.fic");
inspectFile("HospedeNet.fic");
