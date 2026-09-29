import { prisma } from "@/lib/prisma";

// Auditoria determinística (sem IA) da contagem de diárias das hospedagens abertas — de TODOS os
// hotéis. Roda na Vercel, então não depende do worker da Railway estar no ar. Consumida pelo
// Eugênio (assistente do dono) via GET /api/platform-health/diarias, que avisa a equipe de suporte
// do SaaS — nunca a equipe do hotel.
//
// Invariantes conferidos por hospedagem aberta (todos verificados em produção em 29/09/2026: 0
// divergências nas 16 hospedagens abertas, ou seja, nenhum falso positivo com os dados atuais):
//  • ATRASADA   — a virada de hoje (ou de dias anteriores) não aconteceu, passados GRACE_MINUTES do
//                 horário de virada do hotel. É o sinal de worker parado sem terminal aberto.
//  • CONTAGEM   — dailiesCount ≠ nº de StayCharge DAILY.
//  • TOTAL      — totalDaily ≠ soma de DAILY + EARLY_ARRIVAL (mesma regra de stay/period e stay/tariff).
//  • DUPLICADA  — mais de uma diária no mesmo dia (Brasília).
//  • BURACO     — falta diária em algum dia entre o check-in e a última virada, ou há diária fora
//                 desse intervalo.
//
// Uma única consulta agregada no banco devolvendo só as linhas com problema e só colunas de
// identificação (hotel, quarto, id da hospedagem) — nenhum dado de hóspede, e egress ~zero no caso
// normal. As colunas DateTime do Prisma são `timestamp` sem fuso gravado em UTC, por isso a
// conversão dupla `(col AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'`.

const TZ = "America/Sao_Paulo";
// Folga depois do horário de virada antes de considerar a diária atrasada (worker roda a cada minuto).
export const DAILY_AUDIT_GRACE_MINUTES = 30;
const MAX_ROWS = 200;

export type DailyAuditProblem = "ATRASADA" | "CONTAGEM" | "TOTAL" | "DUPLICADA" | "BURACO";

export type DailyAuditRow = {
  tenantId: string;
  hotel: string;
  quarto: string;
  hospedagemId: string;
  problemas: DailyAuditProblem[];
  ultimaVirada: string; // YYYY-MM-DD (Brasília)
  diariasContadas: number;
  diariasLancadas: number;
};

type RawRow = {
  tenant_id: string;
  hotel: string;
  quarto: string;
  stay_id: string;
  last_day: string;
  dailies_count: number;
  n_daily: bigint;
  atrasada: boolean;
  contagem: boolean;
  total: boolean;
  duplicada: boolean;
  buraco: boolean;
};

function brParts(d: Date): { dateKey: string; hhmm: string } {
  return {
    dateKey: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d),
    hhmm: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
  };
}

export async function auditOpenStayDailies(now = new Date()): Promise<DailyAuditRow[]> {
  const today = brParts(now);
  const withGrace = brParts(new Date(now.getTime() - DAILY_AUDIT_GRACE_MINUTES * 60_000));
  // Hotel cujo horário de virada ≤ cutoff já deveria ter virado hoje; senão, só até ontem. Se a
  // folga atravessa a meia-noite, ninguém deve ter virado "hoje" ainda — cutoff vazio.
  const cutoff = withGrace.dateKey === today.dateKey ? withGrace.hhmm : "";

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH charges AS (
      SELECT c."stayCheckinId" AS stay_id,
             COUNT(*) FILTER (WHERE c."chargeType" = 'DAILY') AS n_daily,
             COUNT(DISTINCT ((c."referenceDate" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date)
               FILTER (WHERE c."chargeType" = 'DAILY') AS n_days,
             MIN(((c."referenceDate" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date)
               FILTER (WHERE c."chargeType" = 'DAILY') AS first_day,
             MAX(((c."referenceDate" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date)
               FILTER (WHERE c."chargeType" = 'DAILY') AS max_day,
             COALESCE(SUM(c.amount) FILTER (WHERE c."chargeType" IN ('DAILY', 'EARLY_ARRIVAL')), 0) AS sum_amount
      FROM stay_charges c
      JOIN stay_checkins s ON s.id = c."stayCheckinId" AND s."isClosed" = false
      GROUP BY c."stayCheckinId"
    ),
    stays AS (
      SELECT s.id AS stay_id, s."tenantId" AS tenant_id, COALESCE(t."tradeName", t.name) AS hotel,
             r.number AS quarto, s."dailiesCount" AS dailies_count, s."totalDaily" AS total_daily,
             ((s."checkInDate" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date AS ci_day,
             ((s."lastRolloverDate" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::date AS last_day,
             CASE WHEN t."dailyRolloverTime" <= ${cutoff} THEN ${today.dateKey}::date
                  ELSE ${today.dateKey}::date - 1 END AS expected_last_day,
             COALESCE(ch.n_daily, 0) AS n_daily, COALESCE(ch.n_days, 0) AS n_days,
             ch.first_day, ch.max_day, COALESCE(ch.sum_amount, 0) AS sum_amount
      FROM stay_checkins s
      JOIN tenants t ON t.id = s."tenantId"
      JOIN rooms r ON r.id = s."roomId"
      LEFT JOIN charges ch ON ch.stay_id = s.id
      WHERE s."isClosed" = false
    )
    SELECT tenant_id, hotel, quarto, stay_id, to_char(last_day, 'YYYY-MM-DD') AS last_day,
           dailies_count, n_daily,
           (last_day < expected_last_day) AS atrasada,
           (dailies_count <> n_daily) AS contagem,
           (ABS(total_daily - sum_amount) > 0.009) AS total,
           (n_daily <> n_days) AS duplicada,
           (n_days <> (last_day - ci_day + 1) OR first_day IS DISTINCT FROM ci_day
             OR max_day IS DISTINCT FROM last_day) AS buraco
    FROM stays
    WHERE last_day < expected_last_day
       OR dailies_count <> n_daily
       OR ABS(total_daily - sum_amount) > 0.009
       OR n_daily <> n_days
       OR n_days <> (last_day - ci_day + 1)
       OR first_day IS DISTINCT FROM ci_day
       OR max_day IS DISTINCT FROM last_day
    ORDER BY hotel, quarto
    LIMIT ${MAX_ROWS}
  `;

  return rows.map((r) => {
    const problemas: DailyAuditProblem[] = [];
    if (r.atrasada) problemas.push("ATRASADA");
    if (r.contagem) problemas.push("CONTAGEM");
    if (r.total) problemas.push("TOTAL");
    if (r.duplicada) problemas.push("DUPLICADA");
    if (r.buraco) problemas.push("BURACO");
    return {
      tenantId: r.tenant_id,
      hotel: r.hotel,
      quarto: r.quarto,
      hospedagemId: r.stay_id,
      problemas,
      ultimaVirada: r.last_day,
      diariasContadas: Number(r.dailies_count),
      diariasLancadas: Number(r.n_daily),
    };
  });
}
