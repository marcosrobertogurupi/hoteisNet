import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dateOnlyBrasilia as dateOnly } from "@/lib/brasiliaDate";
import { getSessionUser } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { adjustGuestStayDebit } from "@/lib/guestStayDebit";

function parseLimitTime(limitTime?: string | null) {
  const [h, m] = (limitTime || "14:30").split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 14, m: Number.isFinite(m) ? m : 30 };
}

function nowBrazilHM(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { h, m };
}

// POST /api/stay/rollover
// Verifica todos os quartos ocupados (hospedagens em aberto, StayCheckin.isClosed = false) e,
// para cada um cuja data/hora atual já tenha ultrapassado o horário de virada de diária configurado
// em Configurações (Tenant.dailyRolloverTime) sem que o dia corrente já tenha sido cobrado, lança
// automaticamente +1 diária extra (mesmo valor da diária vigente da hospedagem) e soma no débito
// do hóspede (StayCheckin.totalDaily).
// Idempotente: cada dia só é lançado uma vez por hospedagem (constraint única em StayCharge).
//
// O horário limite NUNCA é aceito do cliente (evita ficar dessincronizado de Configurações,
// como acontecia antes ao usar um horário guardado em localStorage) — é sempre lido do
// Tenant.dailyRolloverTime de cada hospedagem.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const now = new Date();
    const today = dateOnly(now);

    const stays = await prisma.stayCheckin.findMany({
      where: {
        isClosed: false,
        tenantId: session.tenantId,
      },
      include: { room: true, tenant: { select: { dailyRolloverTime: true } } },
    });

    const rolledOver: { roomNumber: string; daysAdded: number; amountAdded: number }[] = [];

    for (const stay of stays) {
      const { h, m } = parseLimitTime(stay.tenant?.dailyRolloverTime);
      const nowHM = nowBrazilHM(now);
      const limitPassedToday = nowHM.h > h || (nowHM.h === h && nowHM.m >= m);

      const lastRollover = dateOnly(stay.lastRolloverDate);
      let daysLate = Math.floor((today.getTime() - lastRollover.getTime()) / 86400000);

      // O dia corrente só é considerado "vencido" depois que o horário de virada configurado já passou
      if (daysLate > 0 && !limitPassedToday) daysLate -= 1;
      if (daysLate <= 0) continue;

      // Valor e nome da tarifa da diária extra = os da última diária vigente já lançada nesta hospedagem
      const lastCharge = await prisma.stayCharge.findFirst({
        where: { stayCheckinId: stay.id, chargeType: "DAILY" },
        orderBy: { referenceDate: "desc" },
      });
      const rate = Number(lastCharge?.amount ?? stay.totalDaily ?? 0);
      const description = lastCharge?.description || "Diária";

      const newLastRollover = new Date(lastRollover);
      newLastRollover.setUTCDate(newLastRollover.getUTCDate() + daysLate);

      // Cada hospedagem é processada numa transação própria (idempotente pela constraint única
      // stayCheckinId+referenceDate): o lançamento das diárias, o incremento de totalDaily/contagem
      // e o débito equivalente no saldo do hóspede caem juntos ou nada cai — sem isso, uma queda no
      // meio deixava StayCharge gravado sem totalDaily/saldo correspondentes.
      const { addedCount, addedAmount } = await txWithRetry(async (tx) => {
        let count = 0;
        let amount = 0;
        let extraCount = 0;
        let extraAmount = 0;
        for (let i = 1; i <= daysLate; i++) {
          const refDate = new Date(lastRollover);
          refDate.setUTCDate(refDate.getUTCDate() + i);
          try {
            await tx.stayCharge.create({
              data: {
                stayCheckinId: stay.id,
                referenceDate: refDate,
                description,
                chargeType: "DAILY",
                amount: rate,
              },
            });
            count++;
            amount += rate;
            // Diária lançada em data igual/posterior à previsão original de saída = estadia
            // ultrapassou o combinado no check-in (equivalente a hpd_qtddiariasextras do legado).
            if (refDate >= stay.expectedCheckOut) {
              extraCount++;
              extraAmount += rate;
            }
          } catch {
            // Já existe lançamento para esse dia (constraint única) — ignora
          }
        }

        if (count > 0) {
          await tx.stayCheckin.update({
            where: { id: stay.id },
            data: {
              dailiesCount: { increment: count },
              ...(extraCount > 0 ? { extraDailiesCount: { increment: extraCount } } : {}),
              totalDaily: { increment: amount },
              lastRolloverDate: newLastRollover,
            },
          });
          // Só as diárias ALÉM da previsão de saída entram como débito novo no saldo do hóspede —
          // as diárias dentro do período combinado já foram debitadas de uma vez no check-in
          // (guestDebitTotal). Sem esse recorte, as noites do período combinado seriam debitadas
          // duas vezes; sem debitar as extras, sobra crédito fantasma no check-out.
          if (extraAmount > 0) {
            await adjustGuestStayDebit(tx, {
              tenantId: stay.tenantId,
              guestId: stay.primaryGuestId,
              stayCheckinId: stay.id,
              delta: extraAmount,
              description: `Diária(s) extra(s) por overstay — Quarto ${stay.room.number} (${extraCount}× ${description})`,
            });
          }
        }
        return { addedCount: count, addedAmount: amount };
      });

      if (addedCount > 0) {
        rolledOver.push({ roomNumber: stay.room.number, daysAdded: addedCount, amountAdded: addedAmount });
      }
    }

    return NextResponse.json({ success: true, rolledOver });
  } catch (error: any) {
    console.error("[POST /api/stay/rollover] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao verificar diárias vencidas." },
      { status: 500 }
    );
  }
}
