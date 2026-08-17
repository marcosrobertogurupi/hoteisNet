import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// Ancora a meia-noite local de Brasília (UTC-3, sem horário de verão desde 2019) de forma
// independente do fuso horário do processo Node — em produção (Vercel) o servidor roda em UTC,
// então usar getFullYear/getMonth/getDate (fuso do processo) gerava referenceDate 3h adiantado
// em relação ao que era criado em ambiente local, fazendo a diária aparecer no dia errado.
function dateOnly(d: Date) {
  const brDateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, day] = brDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0));
}

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
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenantId as string | undefined;

    const now = new Date();
    const today = dateOnly(now);

    const stays = await prisma.stayCheckin.findMany({
      where: {
        isClosed: false,
        tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] },
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

      let addedCount = 0;
      let addedAmount = 0;
      for (let i = 1; i <= daysLate; i++) {
        const refDate = new Date(lastRollover);
        refDate.setUTCDate(refDate.getUTCDate() + i);
        try {
          await prisma.stayCharge.create({
            data: {
              stayCheckinId: stay.id,
              referenceDate: refDate,
              description,
              chargeType: "DAILY",
              amount: rate,
            },
          });
          addedCount++;
          addedAmount += rate;
        } catch {
          // Já existe lançamento para esse dia (constraint única stayCheckinId+referenceDate) — ignora
        }
      }

      if (addedCount > 0) {
        const newLastRollover = new Date(lastRollover);
        newLastRollover.setUTCDate(newLastRollover.getUTCDate() + daysLate);

        await prisma.stayCheckin.update({
          where: { id: stay.id },
          data: {
            dailiesCount: { increment: addedCount },
            totalDaily: { increment: addedAmount },
            lastRolloverDate: newLastRollover,
          },
        });
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
