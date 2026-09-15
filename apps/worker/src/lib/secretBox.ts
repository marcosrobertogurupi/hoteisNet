// Espelho de apps/web/src/lib/secretBox.ts — o worker é CJS puro e não importa apps/web (mesmo
// padrão de duplicação do resto deste app, ver apps/worker/src/aiUsage.ts). Se mudar a cifra ou a
// derivação de chave aqui, mude no lado do apps/web também: os dois precisam decifrar o mesmo valor
// (o token OAuth é gravado por apps/web e lido de volta por este worker).
import { createDecipheriv, scryptSync } from "crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!material) {
    throw new Error("MFA_ENCRYPTION_KEY ou SESSION_SECRET não configurado — defina uma dessas variáveis de ambiente.");
  }
  return scryptSync(material, "hoteisnet-secretbox-v1", 32);
}

/** Decifra um valor gravado por encryptSecret (apps/web). Devolve null se corrompido/vazio. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legado em texto puro

  const [ivPart, tagPart, dataPart] = stored.slice(PREFIX.length).split(":");
  if (!ivPart || !tagPart || !dataPart) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
