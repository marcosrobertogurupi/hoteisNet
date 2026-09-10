import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Cifra simétrica para segredos que precisam ser LIDOS de volta pelo servidor (não servem hash),
// como o segredo TOTP do 2FA. Guardá-los em texto puro significa que um dump do banco — backup
// vazado, acesso indevido ao Postgres — entrega junto o segundo fator de todas as contas.
//
// AES-256-GCM: além de cifrar, autentica (a tag detecta adulteração do valor no banco).
//
// A chave vem de MFA_ENCRYPTION_KEY quando definida; sem ela, é derivada de SESSION_SECRET (que já
// é obrigatório e já protege as sessões). Nunca há chave literal no código — CLAUDE.md, Segurança
// §6. Consequência de usar a derivação: trocar o SESSION_SECRET invalida os segredos já cifrados e
// obriga a equipe a recadastrar o 2FA; defina MFA_ENCRYPTION_KEY para desacoplar as duas coisas.

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!material) {
    throw new Error("MFA_ENCRYPTION_KEY ou SESSION_SECRET não configurado — defina uma dessas variáveis de ambiente.");
  }
  // Salt fixo: a chave precisa ser reproduzível entre instâncias e reinícios. O que dá a
  // aleatoriedade de cada valor cifrado é o IV, sorteado a cada gravação.
  return scryptSync(material, "hoteisnet-secretbox-v1", 32);
}

/** Cifra um segredo para gravação. O retorno já vem com o prefixo de versão. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/**
 * Decifra um valor gravado. Valores SEM o prefixo são segredos legados, gravados em texto puro
 * antes desta mudança, e voltam como estão — assim o 2FA de quem já usava continua funcionando e a
 * migração acontece sozinha na próxima gravação. Devolve null quando o valor está corrompido.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;

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

/** true quando o valor ainda está em texto puro e merece ser regravado cifrado. */
export function isPlaintextSecret(stored: string | null | undefined): boolean {
  return !!stored && !stored.startsWith(PREFIX);
}
