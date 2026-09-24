import type { PrismaClient } from "@prisma/client";

// Ocupação EFETIVA de uma hospedagem — o maior valor entre a saída prevista e (check-in + diárias
// já lançadas). Cobre overstay: enquanto a recepção não finaliza a hospedagem, a ocupação vai no
// mínimo até o fim do dia em Brasília, mesmo que `dailiesCount` esteja momentaneamente atrasado.
//
// Espelha stayOccupiedUntil de apps/web/src/lib/reservationHelpers.ts — o worker é um processo
// separado que não importa apps/web (compila para CommonJS puro via tsc, sem bundler), então esta
// é a cópia canônica DENTRO do worker. TODO lugar em apps/worker que precisa saber se um quarto
// está ocupado deve importar daqui, nunca reimplementar a checagem com `expectedCheckOut` cru —
// isso já causou uma divergência real (ver histórico de apps/worker/src/operationalAgent.ts).
export function stayOccupiedUntil(stay: {
  checkInDate: Date;
  expectedCheckOut: Date;
  dailiesCount: number;
}): Date {
  const billedThrough = new Date(stay.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stay.dailiesCount);
  const effective = billedThrough > stay.expectedCheckOut ? billedThrough : stay.expectedCheckOut;
  if (stay.expectedCheckOut.getTime() < Date.now()) {
    return endOfDayBrasilia(new Date(Math.max(effective.getTime(), Date.now())));
  }
  return effective;
}

// Ids de quartos (dentre os informados) que a manutenção tira de venda para um período que começa em
// `checkIn`: quarto em MAINTENANCE fica indisponível para chegadas até o fim do dia de hoje em
// Brasília ou até a previsão de liberação da OS aberta, o que for maior. Espelha
// maintenanceBlockedRoomIds de apps/web/src/lib/reservationHelpers.ts — mudou a régua lá, muda aqui.
export async function maintenanceBlockedRoomIds(
  db: Pick<PrismaClient, "room">,
  roomIds: string[],
  checkIn: Date
): Promise<Set<string>> {
  if (roomIds.length === 0) return new Set();
  const rooms = await db.room.findMany({
    where: {
      id: { in: roomIds },
      status: "MAINTENANCE",
      ...(checkIn >= endOfDayBrasilia(new Date())
        ? {
            maintenanceTickets: {
              some: { stage: { in: ["OPEN", "EVALUATING", "WAITING"] }, expectedReleaseAt: { gt: checkIn } },
            },
          }
        : {}),
    },
    select: { id: true },
  });
  return new Set(rooms.map((r) => r.id));
}

// Meia-noite (Brasília) do dia seguinte ao da data informada. Usado para "arredondar" a ocupação de
// um overstay para o fim do dia. `en-CA` dá AAAA-MM-DD.
function endOfDayBrasilia(d: Date): Date {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(new Date(`${ymd}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000);
}
