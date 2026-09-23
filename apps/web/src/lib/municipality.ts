// Tabela GLOBAL de municípios (IBGE) — compartilhada por todos os assinantes, sem tenantId. Usada
// para resolver o código IBGE a partir de nome + UF no SNRHos (FNRH) e na NFC-e. Validação única
// das rotas que gravam nela (painel da plataforma).

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI",
  "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const municipalitySelect = {
  id: true,
  name: true,
  ibgeCode: true,
  uf: true,
  dddCode: true,
  updatedAt: true,
} as const;

type MunicipalityData = { name?: string; ibgeCode?: string; uf?: string; dddCode?: string | null };

/**
 * Valida e normaliza nome (maiúsculas), código IBGE (7 dígitos), UF (sigla válida) e DDD (2 dígitos,
 * opcional). `partial` = edição: só os campos presentes no corpo são validados e devolvidos.
 */
export function parseMunicipalityInput(
  body: Record<string, unknown>,
  { partial }: { partial: boolean }
): { ok: true; data: MunicipalityData } | { ok: false; error: string } {
  const data: MunicipalityData = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!name) return { ok: false, error: "Nome do município é obrigatório." };
    if (name.length > 120) return { ok: false, error: "Nome do município muito longo." };
    data.name = name;
  }
  if (!partial || body.ibgeCode !== undefined) {
    const ibgeCode = String(body.ibgeCode ?? "").trim();
    if (!/^\d{7}$/.test(ibgeCode)) return { ok: false, error: "Código IBGE deve ter 7 dígitos." };
    data.ibgeCode = ibgeCode;
  }
  if (!partial || body.uf !== undefined) {
    const uf = String(body.uf ?? "").trim().toUpperCase();
    if (!(UFS as readonly string[]).includes(uf)) return { ok: false, error: "UF inválida." };
    data.uf = uf;
  }
  if (!partial || body.dddCode !== undefined) {
    const ddd = String(body.dddCode ?? "").replace(/\D/g, "");
    if (ddd && !/^\d{2}$/.test(ddd)) return { ok: false, error: "DDD deve ter 2 dígitos." };
    data.dddCode = ddd || null;
  }
  // O código IBGE começa com o código da UF (2 dígitos) — coerência mínima entre os dois campos
  // quando ambos vêm juntos.
  if (data.ibgeCode && data.uf) {
    const ufPrefix: Record<string, string> = {
      RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23",
      RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35",
      PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
    };
    if (!data.ibgeCode.startsWith(ufPrefix[data.uf])) {
      return { ok: false, error: `Código IBGE não pertence à UF ${data.uf} (deveria começar com ${ufPrefix[data.uf]}).` };
    }
  }
  return { ok: true, data };
}
