// Correção pontual de dados (23/09/2026) — hospedagens gravadas 3h ANTES do real.
//
// Causa: a tela de check-in envia data/hora sem fuso ("2026-09-11T15:04:00") e o servidor fazia
// `new Date(valor)`; na Vercel o processo roda em UTC, então 15:04 (Brasília) virava 15:04 UTC =
// 12:04 em Brasília. Corrigido no código por parseBrasiliaDateTime (apps/web/src/lib/brasiliaDate.ts).
//
// Quais registros: só as hospedagens cujo check-in foi feito em PRODUÇÃO — o registro de auditoria
// CHECKIN (tenant_activity_logs) tem IP externo. Check-ins feitos no servidor local (IP ::1 /
// 127.x), que roda no fuso de Brasília, estão corretos e ficam intocados, assim como as hospedagens
// antigas sem registro de auditoria (anteriores ao log; saída prevista já no horário correto).
//
// O que muda (+3h), por hospedagem afetada:
//   - stay_checkins.checkInDate e expectedCheckOut
//   - stay_checkins.lastRolloverDate, só se ainda for igual ao checkInDate (nenhuma virada depois)
//   - stay_charges da 1ª diária (referenceDate = checkInDate) e da chegada antecipada
//     (referenceDate = checkInDate + 30s)
//   - reservations vinculada: checkInDate / checkOutDate, só se forem iguais aos da hospedagem
//     (foram gravados pelo mesmo check-in)
//
// Seguro para rodar mais de uma vez: só pega check-ins anteriores ao deploy da correção e que ainda
// estejam deslocados; as reservas à meia-noite UTC deixam de casar depois de corrigidas.
//
// Uso:  node --env-file=.env scripts/fix-fuso-checkin-2026-09.js            (prévia, só leitura)
//       node --env-file=.env scripts/fix-fuso-checkin-2026-09.js --apply    (aplica, numa transação)

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const SHIFT_MS = 3 * 60 * 60 * 1000;
// Momento em que a correção (PR #30, parseBrasiliaDateTime) entrou no ar em produção — deploy do
// commit 68580e8 concluído na Vercel. Check-ins registrados a partir daqui já foram gravados no
// horário certo e NUNCA podem ser deslocados.
const FIX_LIVE_AT = new Date("2026-09-23T13:04:06Z");
const br = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const plus = (d) => new Date(new Date(d).getTime() + SHIFT_MS);
const same = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();

async function main() {
  const stays = await prisma.$queryRaw`
    SELECT s.id, s."tenantId", s."isClosed", s."checkInDate", s."expectedCheckOut", s."lastRolloverDate",
           s."reservationId", r."number" AS room, l."ipAddress" AS ip, l."createdAt" AS "logAt"
    FROM stay_checkins s
    JOIN rooms r ON r.id = s."roomId"
    JOIN tenant_activity_logs l ON l."entityId" = s.id AND l.action = 'CHECKIN'
    WHERE l."ipAddress" IS NOT NULL
      AND l."ipAddress" NOT IN ('::1', 'desconhecido')
      AND l."ipAddress" NOT LIKE '127.%'
      AND l."ipAddress" NOT LIKE '::ffff:127.%'
      AND l."createdAt" < ${FIX_LIVE_AT}
      -- Idempotência: só o que AINDA está deslocado (gravado ~3h antes do instante real do check-in;
      -- 150–190 min cobre também o horário padrão das 14h digitado alguns minutos antes). Depois de
      -- corrigido, a diferença cai para ~0 e o registro sai deste filtro — rodar de novo não desloca 2x.
      AND extract(epoch from (l."createdAt" - s."checkInDate")) / 60 BETWEEN 150 AND 190
    ORDER BY s."checkInDate"`;

  const plan = [];
  for (const s of stays) {
    const charges = await prisma.stayCharge.findMany({
      where: {
        stayCheckinId: s.id,
        referenceDate: { in: [new Date(s.checkInDate), new Date(new Date(s.checkInDate).getTime() + 30_000)] },
      },
      select: { id: true, referenceDate: true, chargeType: true },
    });
    const reservation = s.reservationId
      ? await prisma.reservation.findUnique({
          where: { id: s.reservationId },
          select: { id: true, reservationNumber: true, checkInDate: true, checkOutDate: true },
        })
      : null;
    plan.push({ s, charges, reservation });
  }

  console.log(`${plan.length} hospedagem(ns) com check-in feito em produção (deslocadas 3h):\n`);
  for (const { s, charges, reservation } of plan) {
    console.log(
      `Quarto ${s.room} ${s.isClosed ? "(encerrada)" : "(EM ABERTO)"} — check-in feito em ${br(s.logAt)}\n` +
        `   chegada:  ${br(s.checkInDate)}  ->  ${br(plus(s.checkInDate))}\n` +
        `   saída:    ${br(s.expectedCheckOut)}  ->  ${br(plus(s.expectedCheckOut))}\n` +
        `   diárias ajustadas: ${charges.map((c) => c.chargeType).join(", ") || "nenhuma"}` +
        `${same(s.lastRolloverDate, s.checkInDate) ? " | marcador da virada ajustado" : ""}` +
        (reservation && (same(reservation.checkInDate, s.checkInDate) || same(reservation.checkOutDate, s.expectedCheckOut))
          ? `\n   reserva ${reservation.reservationNumber || "(sem número)"}: datas ajustadas junto`
          : "")
    );
  }

  // Reservas gravadas à meia-noite UTC (= 21h do dia ANTERIOR em Brasília): a edição da reserva e
  // o arrastar no Mapa de Reservas mandavam só a data ("YYYY-MM-DD"), e `new Date()` a lia como
  // meia-noite UTC. O dia pretendido é o próprio dia em UTC; o horário perdido volta a ser o padrão
  // do hotel (check-in / check-out).
  const midnightReservations = await prisma.$queryRaw`
    SELECT r.id, r."reservationNumber", r.status, r."checkInDate", r."checkOutDate", rm."number" AS room,
           t."standardCheckInTime" AS "inTime", t."standardCheckOutTime" AS "outTime"
    FROM reservations r
    JOIN rooms rm ON rm.id = r."roomId"
    JOIN tenants t ON t.id = rm."tenantId"
    WHERE to_char(r."checkInDate" AT TIME ZONE 'UTC', 'HH24:MI:SS') = '00:00:00'
       OR to_char(r."checkOutDate" AT TIME ZONE 'UTC', 'HH24:MI:SS') = '00:00:00'`;
  const atBr = (d, hhmm) => new Date(`${new Date(d).toISOString().slice(0, 10)}T${hhmm || "00:00"}:00-03:00`);
  const isUtcMidnight = (d) => new Date(d).toISOString().slice(11, 19) === "00:00:00";
  const resPlan = midnightReservations.map((r) => ({
    r,
    data: {
      ...(isUtcMidnight(r.checkInDate) ? { checkInDate: atBr(r.checkInDate, r.inTime || "14:00") } : {}),
      ...(isUtcMidnight(r.checkOutDate) ? { checkOutDate: atBr(r.checkOutDate, r.outTime || "12:00") } : {}),
    },
  }));

  console.log(`\n${resPlan.length} reserva(s) gravada(s) à meia-noite UTC (aparecem na véspera às 21h):\n`);
  for (const { r, data } of resPlan) {
    console.log(
      `Reserva ${r.reservationNumber || "(sem número)"} (${r.status}) quarto ${r.room}\n` +
        `   chegada:  ${br(r.checkInDate)}  ->  ${br(data.checkInDate || r.checkInDate)}\n` +
        `   saída:    ${br(r.checkOutDate)}  ->  ${br(data.checkOutDate || r.checkOutDate)}`
    );
  }

  if (!APPLY) {
    console.log("\nPrévia apenas — nada foi alterado. Rode com --apply para aplicar.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { s, charges, reservation } of plan) {
      await tx.stayCheckin.update({
        where: { id: s.id },
        data: {
          checkInDate: plus(s.checkInDate),
          expectedCheckOut: plus(s.expectedCheckOut),
          ...(same(s.lastRolloverDate, s.checkInDate) ? { lastRolloverDate: plus(s.lastRolloverDate) } : {}),
        },
      });
      for (const c of charges) {
        await tx.stayCharge.update({ where: { id: c.id }, data: { referenceDate: plus(c.referenceDate) } });
      }
      if (reservation) {
        const data = {};
        if (same(reservation.checkInDate, s.checkInDate)) data.checkInDate = plus(reservation.checkInDate);
        if (same(reservation.checkOutDate, s.expectedCheckOut)) data.checkOutDate = plus(reservation.checkOutDate);
        if (Object.keys(data).length) await tx.reservation.update({ where: { id: reservation.id }, data });
      }
    }
    for (const { r, data } of resPlan) {
      if (Object.keys(data).length) await tx.reservation.update({ where: { id: r.id }, data });
    }
  });
  console.log(`\nAplicado: ${plan.length} hospedagem(ns) e ${resPlan.length} reserva(s) corrigida(s).`);
}

main()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
