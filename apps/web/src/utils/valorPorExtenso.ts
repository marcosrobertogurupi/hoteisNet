const UNIDADES = ["", "UM", "DOIS", "TRÊS", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE"];
const DEZ_A_DEZENOVE = ["DEZ", "ONZE", "DOZE", "TREZE", "QUATORZE", "QUINZE", "DEZESSEIS", "DEZESSETE", "DEZOITO", "DEZENOVE"];
const DEZENAS = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"];
const CENTENAS = ["", "CENTO", "DUZENTOS", "TREZENTOS", "QUATROCENTOS", "QUINHENTOS", "SEISCENTOS", "SETECENTOS", "OITOCENTOS", "NOVECENTOS"];

function grupoPorExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CEM";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const parts: string[] = [];
  if (c > 0) parts.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 10) parts.push(UNIDADES[resto]);
    else if (resto < 20) parts.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      parts.push(u > 0 ? `${DEZENAS[d]} E ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return parts.join(" E ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "ZERO";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const parts: string[] = [];
  if (milhoes > 0) {
    parts.push(milhoes === 1 ? "UM MILHÃO" : `${grupoPorExtenso(milhoes)} MILHÕES`);
  }
  if (milhares > 0) {
    parts.push(milhares === 1 ? "MIL" : `${grupoPorExtenso(milhares)} MIL`);
  }
  if (resto > 0) {
    parts.push(grupoPorExtenso(resto));
  }
  return parts.join(" E ");
}

/** Converte um valor monetário para sua descrição por extenso em português, ex: "(SETECENTOS REAIS)". */
export function valorPorExtenso(valor: number): string {
  const valorAbs = Math.abs(valor);
  const reais = Math.floor(valorAbs);
  const centavos = Math.round((valorAbs - reais) * 100);

  const reaisStr = reais === 1 ? "UM REAL" : `${inteiroPorExtenso(reais)} REAIS`;

  if (centavos === 0) {
    return `(${reaisStr})`;
  }

  const centavosStr = centavos === 1 ? "UM CENTAVO" : `${inteiroPorExtenso(centavos)} CENTAVOS`;
  return `(${reaisStr} E ${centavosStr})`;
}
