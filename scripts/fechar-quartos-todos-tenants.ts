/**
 * Script one-shot (issue #77/#78): encerra TODAS as hospedagens abertas de TODOS os tenants.
 *
 * Espelha o check-out normal (PATCH /api/stay/checkin), porém SEM cobrar saldo — a dívida fica
 * pendente (balanceDue = diárias + consumo − desconto − adiantamentos, nunca negativo):
 *   - StayCheckin: isClosed=true, actualCheckOut=agora, balanceDue calculado
 *   - Reservation vinculada (CHECKED_IN) -> CHECKED_OUT
 *   - Room -> VACANT_CLEAN (decisão do Marcos, direto, sem passar por VACANT_DIRTY)
 * Só processa o que está aberto no momento (isClosed=false, não cancelado). Não apaga nada
 * e não toca em CashTransaction.
 *
 * Rodar uma vez, com DATABASE_URL de produção:
 *   npx tsx scripts/fechar-quartos-todos-tenants.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ACTOR = "Script fechar-quartos (#77)";

async function main() {
  const stays = await prisma.stayCheckin.findMany({
    where: { isClosed: false, isCanceled: false },
    select: {
      id: true,
      tenantId: true,
      roomId: true,
      reservationId: true,
      totalConsumption: true,
      otherDebits: true,
      discount: true,
    },
  });
  console.log(`Hospedagens abertas encontradas: ${stays.length}`);

  const now = new Date();
  let ok = 0;
  let falhas = 0;

  for (const s of stays) {
    try {
      await prisma.$transaction(async (tx) => {
        // Mesmas fórmulas do check-out normal (PATCH /api/stay/checkin).
        const [cargas, pagos] = await Promise.all([
          tx.stayCharge.aggregate({ where: { stayCheckinId: s.id }, _sum: { amount: true } }),
          tx.cashTransaction.aggregate({
            where: { stayCheckinId: s.id, type: "ENTRADA", annulledAt: null },
            _sum: { amount: true },
          }),
        ]);
        const totalPago = Number(pagos._sum.amount ?? 0);
        const bruto =
          Number(cargas._sum.amount ?? 0) + Number(s.totalConsumption) + Number(s.otherDebits) - Number(s.discount);
        const saldo = Math.max(0, bruto - totalPago);

        await tx.stayCheckin.updateMany({
          where: { id: s.id, tenantId: s.tenantId, isClosed: false },
          data: {
            isClosed: true,
            actualCheckOut: now,
            checkedOutByUserName: ACTOR,
            totalAdvance: totalPago,
            balanceDue: saldo,
          },
        });

        if (s.reservationId) {
          await tx.reservation.updateMany({
            where: { id: s.reservationId, tenantId: s.tenantId, status: "CHECKED_IN" },
            data: { status: "CHECKED_OUT" },
          });
        }

        await tx.room.updateMany({
          where: { id: s.roomId, tenantId: s.tenantId },
          data: { status: "VACANT_CLEAN", notes: null },
        });
      });
      ok++;
    } catch (e) {
      falhas++;
      console.error(`Falha na hospedagem ${s.id} (tenant ${s.tenantId}):`, e);
    }
  }

  console.log(`Encerradas: ${ok} | Falhas: ${falhas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
