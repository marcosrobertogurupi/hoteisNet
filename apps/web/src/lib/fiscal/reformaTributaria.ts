// Tabelas de referência da Reforma Tributária do Consumo (EC 132/2023, LC 214/2025, LC 227/2026)
// para o cadastro de Perfil Fiscal e a montagem do payload da NFC-e/NF-e.
//
// Fonte: NT 2025.002 da NF-e/NFC-e (grupo UB do XML) + Informe Técnico RT 2025.002
// (tabelas "Código de Situação Tributária do IBS e CBS", "Código de Classificação Tributária —
// cClassTrib" e "Classificação do Crédito Presumido — cCredPres").
//
// A tabela cClassTrib oficial tem ~164 códigos, cada um amarrado a um CST e a um dispositivo da
// LC 214/2025. Aqui mantemos um subconjunto curado, cobrindo o uso real de hotel + restaurante /
// bar. Novos códigos podem ser adicionados em CCLASSTRIB conforme o contador precisar — a tela
// também aceita "Outro código" (6 dígitos) para o que ainda não estiver listado.

export type CstOption = { code: string; label: string };
export type ClassTribOption = { code: string; cst: string; label: string; pRedAliq: number };

// ── CST do IBS / CBS (3 dígitos) ──────────────────────────────────────────────
export const CST_IBSCBS: CstOption[] = [
  { code: "000", label: "000 — Tributação integral" },
  { code: "010", label: "010 — Alíquotas uniformes (setor financeiro)" },
  { code: "011", label: "011 — Alíquotas uniformes reduzidas em 60% ou 30%" },
  { code: "200", label: "200 — Alíquota zero ou reduzida (80/70/60/50/40/30%)" },
  { code: "220", label: "220 — Alíquota fixa" },
  { code: "221", label: "221 — Alíquota fixa proporcional" },
  { code: "222", label: "222 — Redução de base de cálculo" },
  { code: "400", label: "400 — Isenção" },
  { code: "410", label: "410 — Imunidade e não incidência" },
  { code: "510", label: "510 — Diferimento" },
  { code: "515", label: "515 — Diferimento com redução de alíquota" },
  { code: "550", label: "550 — Suspensão" },
  { code: "620", label: "620 — Tributação monofásica" },
  { code: "800", label: "800 — Transferência de crédito" },
  { code: "810", label: "810 — Ajustes de IBS na Zona Franca de Manaus" },
  { code: "811", label: "811 — Ajustes" },
  { code: "820", label: "820 — Tributação em documento fiscal específico" },
  { code: "830", label: "830 — Exclusão de base de cálculo" },
];

export const CST_IBSCBS_CODES = new Set(CST_IBSCBS.map((c) => c.code));

// ── cClassTrib — Código de Classificação Tributária (6 dígitos) ────────────────
// Curado. `pRedAliq` = redução de alíquota de IBS e CBS embutida no código (para preencher o
// campo automaticamente na tela; a alíquota efetiva é calculada na emissão).
export const CCLASSTRIB: ClassTribOption[] = [
  // CST 000 — tributação integral
  { code: "000001", cst: "000", label: "000001 — Tributação integral (regra geral)", pRedAliq: 0 },
  // CST 200 — alíquota reduzida / zero
  { code: "200047", cst: "200", label: "200047 — Bares, restaurantes e lanchonetes (regime específico, redução 40%)", pRedAliq: 40 },
  { code: "200003", cst: "200", label: "200003 — Alimentos destinados ao consumo humano (redução)", pRedAliq: 60 },
  { code: "200052", cst: "200", label: "200052 — Serviços de hotelaria (redução 40%)", pRedAliq: 40 },
  // CST 400 — isenção
  { code: "400001", cst: "400", label: "400001 — Isenção", pRedAliq: 0 },
  // CST 410 — imunidade / não incidência
  { code: "410001", cst: "410", label: "410001 — Imunidade", pRedAliq: 0 },
  { code: "410004", cst: "410", label: "410004 — Exportação (não incidência)", pRedAliq: 0 },
  // CST 620 — monofásico
  { code: "620001", cst: "620", label: "620001 — Tributação monofásica (bebidas)", pRedAliq: 0 },
];

const CCLASSTRIB_BY_CODE = new Map(CCLASSTRIB.map((c) => [c.code, c]));

// ── cCredPres — Classificação do Crédito Presumido (opcional) ──────────────────
export const CCREDPRES: CstOption[] = [
  { code: "", label: "— sem crédito presumido —" },
  { code: "01", label: "01 — Crédito presumido do adquirente de produtor rural" },
  { code: "02", label: "02 — Crédito presumido — bens e serviços de transportador autônomo" },
  { code: "03", label: "03 — Crédito presumido — regime específico" },
];

// ── Imposto Seletivo (IS) ─────────────────────────────────────────────────────
export const CST_IS: CstOption[] = [
  { code: "", label: "— não informar —" },
  { code: "000", label: "000 — Tributação integral do IS" },
  { code: "010", label: "010 — Tributação com alíquota específica (ad rem)" },
  { code: "200", label: "200 — Alíquota reduzida" },
  { code: "400", label: "400 — Isenção do IS" },
  { code: "410", label: "410 — Imunidade / não incidência do IS" },
];

export const CCLASSTRIB_IS: CstOption[] = [
  { code: "", label: "— não informar —" },
  { code: "700001", label: "700001 — Bebidas alcoólicas" },
  { code: "700002", label: "700002 — Bebidas açucaradas" },
  { code: "700003", label: "700003 — Cigarros e produtos do fumo" },
  { code: "700004", label: "700004 — Veículos" },
  { code: "700005", label: "700005 — Bens minerais extraídos" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Opções de cClassTrib compatíveis com o CST IBS/CBS escolhido. */
export function cClassTribOptions(cst: string): ClassTribOption[] {
  return CCLASSTRIB.filter((c) => c.cst === cst);
}

/** Redução de alíquota (%) associada a um cClassTrib conhecido; 0 se desconhecido. */
export function redAliqFor(cClassTrib: string): number {
  return CCLASSTRIB_BY_CODE.get(cClassTrib)?.pRedAliq ?? 0;
}

/** Um cClassTrib conhecido pertence a este CST? (códigos fora da tabela curada passam.) */
export function classTribMatchesCst(cClassTrib: string, cst: string): boolean {
  const known = CCLASSTRIB_BY_CODE.get(cClassTrib);
  return !known || known.cst === cst;
}

/** Rótulo legível de um cClassTrib (cai para o próprio código se não estiver na tabela). */
export function classTribLabel(cClassTrib: string): string {
  return CCLASSTRIB_BY_CODE.get(cClassTrib)?.label ?? cClassTrib;
}
