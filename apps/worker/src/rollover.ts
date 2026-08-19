import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Todos os hotéis atendidos hoje operam no fuso de Brasília.
const TENANT_TIMEZONE = "America/Sao_Paulo";

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

/**
 * Roda a cada minuto. Para cada assinante cujo horário de virada de diária
 * (Tenant.dailyRolloverTime) bate com o horário atual, soma +1 diária em
 * cada apartamento ainda ocupado — desde que a virada daquele dia calendário
 * ainda não tenha sido processada para a estadia (evita duplicar caso o job
 * rode mais de uma vez no mesmo minuto).
 *
 * O dia do próprio check-in nunca gera virada: a 1ª diária já é lançada no
 * momento do check-in (ver apps/web/src/app/api/stay/checkin/route.ts).
 */
export async function runDailyRollover(): Promise<void> {
  const nowHHMM = currentHHMM(TENANT_TIMEZONE);
  const todayKey = dateKey(new Date(), TENANT_TIMEZONE);

  const tenants = await prisma.tenant.findMany({
    where: { dailyRolloverTime: nowHHMM },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const openStays = await prisma.stayCheckin.findMany({
      where: { tenantId: tenant.id, isClosed: false },
    });

    for (const stay of openStays) {
      if (dateKey(stay.lastRolloverDate, TENANT_TIMEZONE) >= todayKey) {
        continue; // virada de hoje já processada para esta estadia
      }

      // Meia-noite em Brasília (UTC-3, fixo — sem horário de verão desde 2019) é 03:00 em UTC.
      // Gravar em "T00:00:00.000Z" (meia-noite UTC) fica 21:00 do dia ANTERIOR em horário local,
      // fazendo a diária aparecer com a mesma data de início da diária anterior no Extrato.
      const referenceDate = new Date(`${todayKey}T03:00:00.000Z`);

      // Valor e nome da tarifa da diária extra = os da última diária já lançada nesta hospedagem
      // (mesma tarifa escolhida no check-in, ou a última tarifa vigente após uma troca) — nunca
      // stay.totalDaily, que é o ACUMULADO de todas as diárias já cobradas (usá-lo aqui duplicaria
      // o valor a cada virada, já que ele cresce a cada diária lançada).
      const lastCharge = await prisma.stayCharge.findFirst({
        where: { stayCheckinId: stay.id, chargeType: "DAILY" },
        orderBy: { referenceDate: "desc" },
      });
      const rate = Number(lastCharge?.amount ?? stay.totalDaily ?? 0);
      const description = lastCharge?.description || "Diária";

      // Diária lançada em data igual/posterior à previsão original de saída = estadia
      // ultrapassou o combinado no check-in (equivalente a hpd_qtddiariasextras do legado).
      const isExtra = referenceDate >= stay.expectedCheckOut;

      try {
        await prisma.$transaction([
          prisma.stayCharge.create({
            data: {
              stayCheckinId: stay.id,
              referenceDate,
              description,
              chargeType: "DAILY",
              amount: rate,
            },
          }),
          prisma.stayCheckin.update({
            where: { id: stay.id },
            data: {
              dailiesCount: { increment: 1 },
              ...(isExtra ? { extraDailiesCount: { increment: 1 } } : {}),
              totalDaily: { increment: rate },
              lastRolloverDate: new Date(),
            },
          }),
        ]);
        console.log(`[rollover] +1 diária — tenant=${tenant.name} stay=${stay.id}`);
      } catch (err: any) {
        // P2002 = unique constraint (stayCheckinId, referenceDate) já satisfeita: virada já lançada.
        if (err?.code !== "P2002") {
          console.error(`[rollover] falha ao processar stay=${stay.id}:`, err);
        }
      }
    }
  }
}
