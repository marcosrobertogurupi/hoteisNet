import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { adjustGuestStayDebit } from "@/lib/guestStayDebit";

// Virada de diária do lado web — espelho de apps/worker/src/rollover.ts (o worker é CJS puro e não
// importa apps/web, então a lógica é duplicada de propósito; ao mudar uma, mude a outra).
//
// Quem chama:
//  • POST /api/stay/rollover — cada terminal com o Mapa de Quartos aberto, a cada minuto, só para o
//    próprio hotel. Rede de segurança imediata para quando o worker (Railway) está fora do ar.
//  • GET /api/cron/diarias — Vercel Cron, 1x ao dia, para TODOS os hotéis. Rede de segurança para o
//    hotel sem nenhum terminal aberto com o worker fora do ar.
//
// Mesmas garantias do worker: só hospedagens PENDENTES (lastRolloverDate antes de hoje em Brasília,
// horário de virada do hotel já passou) — o ciclo normal consulta e volta vazio, sem baixar as
// hospedagens abertas a cada minuto (regra de egress); uma transação por dia com o mesmo lock
// FOR UPDATE do check-out; e o unique (stayCheckinId, referenceDate) com a MESMA referenceDate do
// worker (meia-noite de Brasília = T03:00Z), então worker e web nunca lançam a mesma diária duas vezes.

const TZ = "America/Sao_Paulo";
// Mesmo teto do worker — um lastRolloverDate corrompido não gera centenas de diárias de uma vez.
const MAX_CATCH_UP_DAYS = 31;

// Ação na trilha da plataforma quando o cron /api/cron/diarias precisou lançar diárias (= o worker falhou).
export const DAILY_CATCHUP_ACTION = "DAILY_ROLLOVER_CATCHUP";

function currentHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date); // YYYY-MM-DD
}

function nextDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type RolloverLaunch = {
  tenantId: string;
  stayCheckinId: string;
  roomNumber: string;
  daysAdded: number;
  amountAdded: number;
};

/**
 * Lança as diárias que faltam nas hospedagens abertas cujo horário de virada já passou.
 * `tenantId` restringe a um hotel (rota da sessão); sem ele, varre todos (cron da plataforma).
 */
export async function runDailyRolloverCatchUp(opts: { tenantId?: string } = {}): Promise<RolloverLaunch[]> {
  const nowHHMM = currentHHMM();
  const todayKey = dateKey(new Date());
  const todayStartBr = new Date(`${todayKey}T00:00:00-03:00`);

  const pendingStays = await prisma.stayCheckin.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
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
      room: { select: { number: true } },
    },
  });

  const launches: RolloverLaunch[] = [];

  for (const stay of pendingStays) {
    const missingDays: string[] = [];
    let key = nextDayKey(dateKey(stay.lastRolloverDate));
    while (key <= todayKey && missingDays.length < MAX_CATCH_UP_DAYS) {
      missingDays.push(key);
      key = nextDayKey(key);
    }
    if (key <= todayKey) {
      console.error(`[rollover-web] stay=${stay.id} com mais de ${MAX_CATCH_UP_DAYS} dias sem virada — processando só os mais antigos.`);
    }

    let daysAdded = 0;
    let amountAdded = 0;

    for (const dayKey of missingDays) {
      const referenceDate = new Date(`${dayKey}T03:00:00.000Z`);
      try {
        const rate = await txWithRetry(async (tx) => {
          await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stay.id} FOR UPDATE`;
          const fresh = await tx.stayCheckin.findFirst({
            where: { id: stay.id, tenantId: stay.tenantId },
            select: { isClosed: true, lastRolloverDate: true },
          });
          if (!fresh || fresh.isClosed) return null;
          if (dateKey(fresh.lastRolloverDate) >= dayKey) return null; // worker/outro terminal já lançou

          // Valor e nome = os da última diária já lançada (tarifa vigente) — nunca totalDaily, que
          // é o acumulado.
          const lastCharge = await tx.stayCharge.findFirst({
            where: { stayCheckinId: stay.id, chargeType: "DAILY" },
            orderBy: { referenceDate: "desc" },
            select: { amount: true, description: true },
          });
          const value = Number(lastCharge?.amount ?? 0);
          const description = lastCharge?.description || "Diária";
          const isExtra = referenceDate >= stay.expectedCheckOut;

          await tx.stayCharge.create({
            data: { stayCheckinId: stay.id, referenceDate, description, chargeType: "DAILY", amount: value },
          });
          await tx.stayCheckin.updateMany({
            where: { id: stay.id, tenantId: stay.tenantId },
            data: {
              dailiesCount: { increment: 1 },
              ...(isExtra ? { extraDailiesCount: { increment: 1 } } : {}),
              totalDaily: { increment: value },
              lastRolloverDate: dayKey === todayKey ? new Date() : referenceDate,
            },
          });
          // Só a diária além da previsão de saída vira débito novo — as do período combinado já
          // foram debitadas no check-in (ver guestStayDebit.ts).
          if (isExtra && value > 0) {
            await adjustGuestStayDebit(tx, {
              tenantId: stay.tenantId,
              guestId: stay.primaryGuestId,
              stayCheckinId: stay.id,
              delta: value,
              description: `Diária extra por overstay — Quarto ${stay.room.number} (${description})`,
            });
          }
          return value;
        });
        if (rate === null) continue;
        daysAdded++;
        amountAdded += rate;
      } catch (err: any) {
        if (err?.code !== "P2002") {
          console.error(`[rollover-web] falha stay=${stay.id} dia=${dayKey}:`, err?.message || err);
          break; // não deixa buraco — tenta de novo no próximo ciclo
        }
        // A diária desse dia já existe (lançada por outro caminho): só avança o marcador.
        await prisma.stayCheckin.updateMany({
          where: { id: stay.id, tenantId: stay.tenantId, lastRolloverDate: { lt: referenceDate } },
          data: { lastRolloverDate: dayKey === todayKey ? new Date() : referenceDate },
        });
      }
    }

    if (daysAdded > 0) {
      launches.push({
        tenantId: stay.tenantId,
        stayCheckinId: stay.id,
        roomNumber: stay.room.number,
        daysAdded,
        amountAdded: Math.round(amountAdded * 100) / 100,
      });
    }
  }

  return launches;
}
