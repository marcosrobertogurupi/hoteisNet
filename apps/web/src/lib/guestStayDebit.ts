import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

// Mantém o saldo do hóspede (`Guest.balance`) em sincronia com o valor devido pela hospedagem
// quando ele muda DEPOIS do check-in.
//
// No check-in (`POST /api/stay/checkin`) o valor total esperado da hospedagem já é debitado do
// saldo do hóspede de uma vez (`GuestBalanceEntry` DEBITO + `Guest.balance -= total`), como
// contrapeso dos créditos que cada pagamento gera. Só que as diárias lançadas DEPOIS — virada
// automática (`stay/rollover`), prorrogação do período (`stay/period`) e troca de tarifa
// (`stay/tariff`) — alteravam apenas `StayCharge`/`totalDaily` e nunca o saldo. Resultado: o
// hóspede pagava a diária extra no check-out (o pagamento CREDITA o saldo), mas o débito
// correspondente nunca existiu → sobrava um crédito fantasma igual ao valor da diária, reutilizável
// depois pela forma "Debitar Saldo Hóspede".
//
// `delta > 0` = passou a dever mais → DEBITO (saldo diminui). `delta < 0` = passou a dever menos
// (tarifa menor, período encurtado) → CREDITO (saldo volta). Chame SEMPRE dentro da mesma
// transação que grava/ajusta o `StayCharge`.
export async function adjustGuestStayDebit(
  tx: TxClient,
  params: {
    tenantId: string;
    guestId: string | null | undefined;
    stayCheckinId: string;
    delta: number;
    description: string;
    operatorId?: string | null;
    operatorName?: string | null;
  }
): Promise<void> {
  const { tenantId, guestId, stayCheckinId, delta, description, operatorId, operatorName } = params;
  if (!guestId) return;
  const rounded = Math.round(delta * 100) / 100;
  if (Math.abs(rounded) < 0.005) return;

  const type: "DEBITO" | "CREDITO" = rounded > 0 ? "DEBITO" : "CREDITO";
  const amount = Math.abs(rounded);

  await tx.guest.update({
    where: { id: guestId },
    data: { balance: type === "DEBITO" ? { decrement: amount } : { increment: amount } },
  });
  await tx.guestBalanceEntry.create({
    data: {
      tenantId,
      guestId,
      stayCheckinId,
      type,
      amount,
      description,
      operatorId: operatorId || null,
      operatorName: operatorName || null,
    },
  });
}
