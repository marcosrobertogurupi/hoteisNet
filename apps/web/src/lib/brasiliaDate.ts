// Ancora a meia-noite local de Brasília (UTC-3, sem horário de verão desde 2019) de forma
// independente do fuso horário do processo Node — em produção (Vercel) o servidor roda em UTC,
// então usar getFullYear/getMonth/getDate (fuso do processo) gera referenceDate 3h adiantado
// em relação ao que é criado em ambiente local.
export function dateOnlyBrasilia(d: Date): Date {
  const brDateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, day] = brDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0));
}

const BR_TZ = "America/Sao_Paulo";
// Brasília é UTC-3 fixo desde 2019 (sem horário de verão).
const BR_OFFSET = "-03:00";

/**
 * Data (YYYY-MM-DD) de um instante no calendário de BRASÍLIA. Serve no servidor e no navegador.
 *
 * Use no lugar de `iso.split("T")[0]` / `iso.slice(0, 10)` sempre que o valor for um INSTANTE
 * vindo do banco/API: esse recorte devolve a data em UTC, e qualquer horário depois das 21h em
 * Brasília cai no dia seguinte. Strings que já são só data ("YYYY-MM-DD") voltam como estão.
 */
export function brDateKey(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Data/hora sem fuso já é horário de parede de Brasília: a data é o próprio prefixo.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return s.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return typeof value === "string" ? value.split("T")[0] : "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ }).format(d);
}

/** Hora (HH:MM) de um instante no relógio de Brasília. */
export function brTimeHHMM(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { timeZone: BR_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/**
 * Converte a data/hora recebida do cliente num instante real, interpretando valores SEM fuso como
 * horário de Brasília (é o horário que o operador digitou/escolheu na tela).
 *
 * Antes cada rota fazia `new Date(valor)`: o servidor da Vercel roda em UTC, então
 * "2026-09-11T15:04:00" virava 15:04 UTC = 12:04 em Brasília — check-in e saída prevista gravados
 * 3h antes do real (check-in de madrugada caía no dia anterior e a saída das 12h virava 09h).
 *
 * Aceita: Date; ISO com fuso ("…Z", "…-03:00") — usado como está; "YYYY-MM-DDTHH:MM[:SS]" ou com
 * espaço; "DD/MM/YYYY[ HH:MM[:SS]]"; e só data ("YYYY-MM-DD"), que recebe `fallbackTime` (HH:MM,
 * horário de Brasília; padrão 00:00). Valor inválido devolve uma Date inválida (isNaN).
 */
export function parseBrasiliaDateTime(value: unknown, fallbackTime = "00:00"): Date {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(NaN);
  const s = value.trim();

  // Já tem fuso explícito (Z ou ±HH:MM / ±HHMM depois da hora): é um instante real.
  if (/[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s);

  let m = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (m) return new Date(`${m[1]}T${normalizeHHMM(fallbackTime)}:00${BR_OFFSET}`);

  m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?(\.\d+)?$/);
  if (m) return new Date(`${m[1]}T${m[2]}${m[3] || ":00"}${BR_OFFSET}`);

  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2})(:\d{2})?)?$/);
  if (m) {
    const time = m[4] ? `${m[4]}${m[5] || ":00"}` : `${normalizeHHMM(fallbackTime)}:00`;
    return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}${BR_OFFSET}`);
  }

  return new Date(s);
}

function normalizeHHMM(hhmm: string): string {
  const [h, mi] = String(hhmm || "00:00").split(":");
  return `${String(Number(h) || 0).padStart(2, "0")}:${String(Number(mi) || 0).padStart(2, "0")}`;
}
