// Corrige, uma única vez, o snapshot totalAdvance/balanceDue de hospedagens abertas cujo valor foi
// gravado zerado por causa de um pagamento lançado no ato do check-in antes da rota persistir esses
// dois campos (POST /api/stay/checkin agora grava isso a partir desta sessão em diante).
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const stays = await prisma.stayCheckin.findMany({ where: { isClosed: false } });
  let fixed = 0;

  for (const stay of stays) {
    const [chargesAgg, paymentsAgg] = await Promise.all([
      prisma.stayCharge.aggregate({ where: { stayCheckinId: stay.id }, _sum: { amount: true } }),
      prisma.cashTransaction.aggregate({ where: { stayCheckinId: stay.id, type: "ENTRADA" }, _sum: { amount: true } }),
    ]);
    const totalDiarias = Number(chargesAgg._sum.amount || 0);
    const totalPago = Number(paymentsAgg._sum.amount || 0);
    const saldo = Math.max(
      0,
      totalDiarias + Number(stay.totalConsumption) + Number(stay.otherDebits) - totalPago - Number(stay.discount)
    );

    if (Number(stay.totalAdvance) !== totalPago || Number(stay.balanceDue) !== saldo) {
      await prisma.stayCheckin.update({
        where: { id: stay.id },
        data: { totalAdvance: totalPago, balanceDue: saldo },
      });
      fixed++;
      console.log(`stay ${stay.id}: totalAdvance ${stay.totalAdvance} -> ${totalPago}, balanceDue ${stay.balanceDue} -> ${saldo}`);
    }
  }

  console.log(`Concluído. ${fixed} de ${stays.length} hospedagens abertas corrigidas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
