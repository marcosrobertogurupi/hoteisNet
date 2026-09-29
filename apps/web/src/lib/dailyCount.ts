import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { brDateKey, brTimeHHMM } from "@/lib/brasiliaDate";

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

// Contagem de diárias de um período — SEMPRE pelas horas e pelas viradas de diária do hotel, NUNCA
// só pela diferença de datas nem por round(horas / 24). Regra do WinDev (CalcularDiarias + aviso do
// check-in "O sistema irá gerar outra diária logo após a data/hora permitida") e do rollover do
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
const DEFAULT_RULES: DailyCountRules = {
  standardCheckInTime: "14:00",
  earlyCheckinToleranceMinutes: 60,
  dailyRolloverTime: "14:30",
};
// Chegada antes deste horário é madrugada — sempre chegada antecipada (mesmo corte do check-in).
const OVERNIGHT_CUTOFF_MINUTES = 6 * 60;

export async function getTenantDailyRules(tx: PrismaClientOrTx, tenantId: string): Promise<DailyCountRules> {
  const t = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { standardCheckInTime: true, earlyCheckinToleranceMinutes: true, dailyRolloverTime: true },
  });
  return {
    standardCheckInTime:
      t?.standardCheckInTime && HHMM.test(t.standardCheckInTime) ? t.standardCheckInTime : DEFAULT_RULES.standardCheckInTime,
    earlyCheckinToleranceMinutes:
      t && Number.isFinite(t.earlyCheckinToleranceMinutes) && t.earlyCheckinToleranceMinutes >= 0
        ? t.earlyCheckinToleranceMinutes
        : DEFAULT_RULES.earlyCheckinToleranceMinutes,
    dailyRolloverTime:
      t?.dailyRolloverTime && HHMM.test(t.dailyRolloverTime) ? t.dailyRolloverTime : DEFAULT_RULES.dailyRolloverTime,
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

export function countDailies(checkIn: Date, checkOut: Date, rules: DailyCountRules): number {
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) return 1;

  let dailies = 1;
  const arrivalKey = brDateKey(checkIn);
  const departureKey = brDateKey(checkOut);

  // Virada do dia da chegada: horário padrão de check-in (a tolerância só isenta quem chega pouco
  // antes; madrugada sempre conta). Conta se a estadia passa desse horário.
  const arrivalMin = toMinutes(brTimeHHMM(checkIn));
  const earlyCutoff = toMinutes(rules.standardCheckInTime) - rules.earlyCheckinToleranceMinutes;
  const earlyArrival = arrivalMin < OVERNIGHT_CUTOFF_MINUTES || arrivalMin < earlyCutoff;
  if (earlyArrival && checkOut > atBrasilia(arrivalKey, toMinutes(rules.standardCheckInTime))) dailies += 1;

  // Viradas dos dias seguintes: uma por dia, no dailyRolloverTime, se acontecer antes da saída.
  // Teto de segurança contra período corrompido (uma estadia real nunca chega perto disso).
  const rolloverMin = toMinutes(rules.dailyRolloverTime);
  let key = nextDayKey(arrivalKey);
  for (let i = 0; key <= departureKey && i < 3660; i++, key = nextDayKey(key)) {
    if (atBrasilia(key, rolloverMin) < checkOut) dailies += 1;
  }
  return dailies;
}
