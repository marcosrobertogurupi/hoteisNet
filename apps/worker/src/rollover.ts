import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Todos os hotéis atendidos hoje operam no fuso de Brasília.
const TENANT_TIMEZONE = "America/Sao_Paulo";

// Teto de dias recuperados de uma vez para a mesma hospedagem — protege contra um lastRolloverDate
// corrompido gerar centenas de diárias num único ciclo. Um atraso maior que isso vira alerta no log.
const MAX_CATCH_UP_DAYS = 31;

function currentHHMM(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); // YYYY-MM-DD
}

// Dia seguinte a uma chave YYYY-MM-DD (aritmética em UTC ao meio-dia: sem risco de fuso/horário de verão).
function nextDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Roda a cada minuto. Lança +1 diária em cada apartamento ainda ocupado cujo hotel já passou do
 * horário de virada (Tenant.dailyRolloverTime) hoje e cuja virada de hoje ainda não foi feita.
 *
 * Antes a virada só acontecia se o job rodasse EXATAMENTE no minuto configurado: um deploy/reinício
 * do worker, um atraso do cron ou uma consulta lenta naquele minuto deixava o dia inteiro sem
 * diária em todos os quartos, sem nenhuma recuperação. Agora qualquer ciclo depois do horário
 * recupera o que faltou — inclusive dias inteiros perdidos com o worker fora do ar (uma diária por
 * dia, cada uma com a própria data de referência).
 *
 * Idempotência: `lastRolloverDate` avança a cada virada e o unique (stayCheckinId, referenceDate)
 * de StayCharge barra lançamento duplicado da mesma data. A linha da hospedagem é travada (mesmo
 * lock do check-out), então uma virada nunca lança diária numa hospedagem que acabou de fechar.
 *
 * O dia do próprio check-in nunca gera virada: a 1ª diária já é lançada no momento do check-in
 * (ver apps/web/src/app/api/stay/checkin/route.ts) e `lastRolloverDate` nasce com a data dele.
 */
export async function runDailyRollover(): Promise<void> {
  const nowHHMM = currentHHMM(TENANT_TIMEZONE);
  const todayKey = dateKey(new Date(), TENANT_TIMEZONE);
  const todayStartBr = new Date(`${todayKey}T00:00:00-03:00`);

  // Só as hospedagens PENDENTES de virada hoje (lastRolloverDate antes de hoje, em Brasília) de
  // hotéis cujo horário de virada já passou. "HH:MM" com zero à esquerda compara corretamente como
  // texto. Depois de processada, a hospedagem sai deste filtro — o ciclo normal volta vazio.
  const pendingStays = await prisma.stayCheckin.findMany({
    where: {
      isClosed: false,
      lastRolloverDate: { lt: todayStartBr },
      tenant: { dailyRolloverTime: { lte: nowHHMM } },
    },
    select: {
      id: true,
      tenantId: true,
      primaryGuestId: true,
      lastRolloverDate: true,
      expectedCheckOut: true,
      totalDaily: true,
      tenant: { select: { name: true } },
    },
  });

  for (const stay of pendingStays) {
    // Dias ainda sem virada: do dia seguinte à última virada até hoje (inclusive).
    const missingDays: string[] = [];
    let key = nextDayKey(dateKey(stay.lastRolloverDate, TENANT_TIMEZONE));
    while (key <= todayKey && missingDays.length < MAX_CATCH_UP_DAYS) {
      missingDays.push(key);
      key = nextDayKey(key);
    }
    if (key <= todayKey) {
      console.error(
        `[rollover] stay=${stay.id} com mais de ${MAX_CATCH_UP_DAYS} dias sem virada — processando só os ${MAX_CATCH_UP_DAYS} mais antigos neste ciclo.`
      );
    }

    for (const dayKey of missingDays) {
      // Meia-noite em Brasília (UTC-3, fixo — sem horário de verão desde 2019) é 03:00 em UTC.
      // Gravar em "T00:00:00.000Z" (meia-noite UTC) fica 21:00 do dia ANTERIOR em horário local,
      // fazendo a diária aparecer com a mesma data de início da diária anterior no Extrato.
      const referenceDate = new Date(`${dayKey}T03:00:00.000Z`);

      try {
        const launched = await prisma.$transaction(async (tx) => {
          // Mesmo lock do check-out: serializa com ele e revalida o estado depois do lock.
          await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stay.id} FOR UPDATE`;
          const fresh = await tx.stayCheckin.findUnique({
            where: { id: stay.id },
            select: { isClosed: true, lastRolloverDate: true },
          });
          if (!fresh || fresh.isClosed) return false;
          if (dateKey(fresh.lastRolloverDate, TENANT_TIMEZONE) >= dayKey) return false; // outro ciclo já lançou

          // Valor e nome da tarifa da diária = os da última diária já lançada nesta hospedagem
          // (mesma tarifa escolhida no check-in, ou a última tarifa vigente após uma troca) — nunca
          // stay.totalDaily, que é o ACUMULADO de todas as diárias já cobradas.
          const lastCharge = await tx.stayCharge.findFirst({
            where: { stayCheckinId: stay.id, chargeType: "DAILY" },
            orderBy: { referenceDate: "desc" },
            select: { amount: true, description: true },
          });
          const rate = Number(lastCharge?.amount ?? stay.totalDaily ?? 0);
          const description = lastCharge?.description || "Diária";

          // Diária lançada em data igual/posterior à previsão original de saída = estadia
          // ultrapassou o combinado no check-in (equivalente a hpd_qtddiariasextras do legado).
          const isExtra = referenceDate >= stay.expectedCheckOut;

          await tx.stayCharge.create({
            data: {
              stayCheckinId: stay.id,
              referenceDate,
              description,
              chargeType: "DAILY",
              amount: rate,
            },
          });
          await tx.stayCheckin.update({
            where: { id: stay.id },
            data: {
              dailiesCount: { increment: 1 },
              ...(isExtra ? { extraDailiesCount: { increment: 1 } } : {}),
              totalDaily: { increment: rate },
              // Dia processado (não "agora"): numa recuperação de vários dias, cada iteração
              // avança exatamente um dia.
              lastRolloverDate: dayKey === todayKey ? new Date() : referenceDate,
            },
          });
          // Só a diária ALÉM da previsão de saída (overstay) entra como débito novo no saldo do
          // hóspede — as diárias do período combinado já foram debitadas de uma vez no check-in
          // (guestDebitTotal). Debitá-las de novo aqui contaria em dobro; não debitar as de overstay
          // deixaria sobrar crédito fantasma quando o hóspede paga a diária extra no check-out.
          if (isExtra && rate > 0) {
            await tx.guest.update({
              where: { id: stay.primaryGuestId },
              data: { balance: { decrement: rate } },
            });
            await tx.guestBalanceEntry.create({
              data: {
                tenantId: stay.tenantId,
                guestId: stay.primaryGuestId,
                stayCheckinId: stay.id,
                type: "DEBITO",
                amount: rate,
                description: `Diária extra por overstay — ${description}`,
              },
            });
          }
          return true;
        });
        if (launched) {
          console.log(`[rollover] +1 diária (${dayKey}) — tenant=${stay.tenant.name} stay=${stay.id}`);
        }
      } catch (err: any) {
        // P2002 = unique constraint (stayCheckinId, referenceDate) já satisfeita: virada já lançada.
        if (err?.code !== "P2002") {
          console.error(`[rollover] falha ao processar stay=${stay.id} dia=${dayKey}:`, err);
          break; // não pula para o dia seguinte deixando um buraco — tenta de novo no próximo ciclo
        }
        // A diária desse dia já existe: só avança o marcador, senão a hospedagem continuaria
        // "pendente" e voltaria a cada minuto.
        await prisma.stayCheckin.updateMany({
          where: { id: stay.id, lastRolloverDate: { lt: referenceDate } },
          data: { lastRolloverDate: dayKey === todayKey ? new Date() : referenceDate },
        });
      }
    }
  }
}
