import { brDateKey, brTimeHHMM } from "@/lib/brasiliaDate";

// Núcleo PURO da contagem de diárias (sem prisma) — importável tanto pelas rotas quanto pelas telas.
// No servidor, busque as regras do hotel com getTenantDailyRules (lib/dailyCount.ts); nas telas, use
// `dailyCountRules` do ThemeContext (vem de /api/tenant/settings).
//
// Contagem de diárias de um período — SEMPRE pelas horas e pelas viradas de diária do hotel, NUNCA
// só pela diferença de datas nem por round/ceil(horas / 24). Regra do WinDev (CalcularDiarias + aviso
// do check-in "O sistema irá gerar outra diária logo após a data/hora permitida") e do rollover do
// HoteisNet (apps/worker/src/rollover.ts, lib/dailyRollover.ts):
//
//  • a 1ª diária começa na entrada;
//  • no dia da chegada, a virada é o horário padrão de check-in (Tenant.standardCheckInTime, menos a
//    tolerância earlyCheckinToleranceMinutes; chegada de madrugada — antes das 06:00 — sempre conta):
//    quem entra antes dela e continua no hotel depois dela ganha +1 diária (chegada antecipada; a
//    tela de check-in pode trocar por meia diária/valor fixo/cortesia, aqui conta o padrão = 1);
//  • em cada dia seguinte, a virada é Tenant.dailyRolloverTime: cada virada que acontece antes da
//    saída gera +1 diária. O dia da chegada nunca gera virada pelo dailyRolloverTime (a 1ª diária
//    já cobre), igual ao rollover.
//
// Ex.: entrada 05/09 00:01, virada 05/09 14:00, saída 06/09 06:00 → 2 diárias.
//      entrada 05/10 14:00, saída 08/10 12:00, virada 14:30 → 3 diárias.
export type DailyCountRules = {
  standardCheckInTime: string;
  earlyCheckinToleranceMinutes: number;
  dailyRolloverTime: string;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_DAILY_RULES: DailyCountRules = {
  standardCheckInTime: "14:00",
  earlyCheckinToleranceMinutes: 60,
  dailyRolloverTime: "14:30",
};
// Chegada antes deste horário é madrugada — sempre chegada antecipada (mesmo corte do check-in).
const OVERNIGHT_CUTOFF_MINUTES = 6 * 60;

// Regras válidas a partir do que está gravado no Tenant (valor ausente/inválido cai no padrão).
export function normalizeDailyRules(t: {
  standardCheckInTime?: string | null;
  earlyCheckinToleranceMinutes?: number | null;
  dailyRolloverTime?: string | null;
} | null | undefined): DailyCountRules {
  const tolerance = Number(t?.earlyCheckinToleranceMinutes);
  return {
    standardCheckInTime:
      t?.standardCheckInTime && HHMM.test(t.standardCheckInTime) ? t.standardCheckInTime : DEFAULT_DAILY_RULES.standardCheckInTime,
    earlyCheckinToleranceMinutes:
      t?.earlyCheckinToleranceMinutes != null && Number.isFinite(tolerance) && tolerance >= 0
        ? tolerance
        : DEFAULT_DAILY_RULES.earlyCheckinToleranceMinutes,
    dailyRolloverTime:
      t?.dailyRolloverTime && HHMM.test(t.dailyRolloverTime) ? t.dailyRolloverTime : DEFAULT_DAILY_RULES.dailyRolloverTime,
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Instante (Brasília, UTC-3 fixo) de `minutes` após a meia-noite do dia `ymd`.
function atBrasilia(ymd: string, minutes: number): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return new Date(`${ymd}T${hh}:${mm}:00-03:00`);
}

function nextDayKey(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Instante da virada de diária de um dia (YYYY-MM-DD, Brasília) posterior ao da chegada. A diária
 * desse dia faz parte de um período que termina em `checkOut` se, e só se, este instante < checkOut —
 * é o critério que o rollover usa para separar diária prevista (já debitada no check-in) de extra.
 */
export function rolloverInstant(dayKey: string, rules: DailyCountRules): Date {
  return atBrasilia(dayKey, toMinutes(rules.dailyRolloverTime));
}

export type DailyCountBreakdown = {
  /** Total de diárias do período (inclui a da chegada antecipada, quando houver). */
  total: number;
  /**
   * true quando uma das diárias do total é a da chegada antecipada/madrugada. No check-in essa
   * diária é decidida no painel próprio (diária extra/meia/taxa/cortesia, lançada como
   * EARLY_ARRIVAL) — quem já trata a chegada antecipada à parte usa `total - 1` para não cobrá-la
   * em dobro.
   */
  earlyArrival: boolean;
};

export function countDailiesBreakdown(checkIn: Date, checkOut: Date, rules: DailyCountRules): DailyCountBreakdown {
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    return { total: 1, earlyArrival: false };
  }

  let total = 1;
  const arrivalKey = brDateKey(checkIn);
  const departureKey = brDateKey(checkOut);

  // Virada do dia da chegada: horário padrão de check-in (a tolerância só isenta quem chega pouco
  // antes; madrugada sempre conta). Conta se a estadia passa desse horário.
  const arrivalMin = toMinutes(brTimeHHMM(checkIn));
  const earlyCutoff = toMinutes(rules.standardCheckInTime) - rules.earlyCheckinToleranceMinutes;
  const isEarly = arrivalMin < OVERNIGHT_CUTOFF_MINUTES || arrivalMin < earlyCutoff;
  const earlyArrival = isEarly && checkOut > atBrasilia(arrivalKey, toMinutes(rules.standardCheckInTime));
  if (earlyArrival) total += 1;

  // Viradas dos dias seguintes: uma por dia, no dailyRolloverTime, se acontecer antes da saída.
  // Teto de segurança contra período corrompido (uma estadia real nunca chega perto disso).
  let key = nextDayKey(arrivalKey);
  for (let i = 0; key <= departureKey && i < 3660; i++, key = nextDayKey(key)) {
    if (rolloverInstant(key, rules) < checkOut) total += 1;
  }
  return { total, earlyArrival };
}

export function countDailies(checkIn: Date, checkOut: Date, rules: DailyCountRules): number {
  return countDailiesBreakdown(checkIn, checkOut, rules).total;
}

/**
 * Diárias "normais" (StayCharge DAILY) de uma hospedagem cujo período vai de checkIn a checkOut —
 * sem a da chegada antecipada, que na hospedagem é cobrada à parte (EARLY_ARRIVAL, decidida no
 * painel do check-in). Base do débito no check-in, da prorrogação (stay/period) e das diárias
 * extras exibidas no extrato. Nunca menor que 1.
 */
export function countStayDailies(checkIn: Date, checkOut: Date, rules: DailyCountRules): number {
  const { total, earlyArrival } = countDailiesBreakdown(checkIn, checkOut, rules);
  return Math.max(1, total - (earlyArrival ? 1 : 0));
}
