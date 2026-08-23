import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export interface ProcessPaymentLineParams {
  tenantId: string;
  cashRegisterId: string;
  stayCheckinId: string;
  guestId?: string | null;
  roomNumber: string;
  guestName: string;
  amount: number;
  paymentMethodDescription: string;
  description: string;
  operatorId?: string | null;
  operatorName?: string | null;
}

export interface ProcessPaymentLineResult {
  cashTransactionId: string | null;
  accountsReceivableId?: string;
}

// Resolve a forma de pagamento cadastrada (case-insensitive) e aplica as regras de negócio das
// suas flags — Parcelamento (contas a receber), Debitar Saldo Hóspede, Soma Caixa x Conta
// Corrente. Transf.Débito não é tratado aqui: é bloqueado, pois esse fluxo tem sua própria rota
// dedicada (/api/stay/transfer-debit), já que precisa de um quarto de destino que este helper não
// recebe. Ponto único usado pelos três lugares que criam CashTransaction a partir de um pagamento
// de hospedagem: check-in (adiantamentos), pagamento-lote e pagamento-checkin.
export async function processPaymentLine(
  tx: TxClient,
  params: ProcessPaymentLineParams
): Promise<ProcessPaymentLineResult> {
  const {
    tenantId,
    cashRegisterId,
    stayCheckinId,
    guestId,
    roomNumber,
    guestName,
    amount,
    paymentMethodDescription,
    description,
    operatorId,
    operatorName,
  } = params;

  const pm = await tx.paymentMethod.findFirst({
    where: { tenantId, description: { equals: paymentMethodDescription, mode: "insensitive" } },
  });

  if (pm?.transferDebit) {
    throw new Error(
      `A forma de pagamento "${paymentMethodDescription}" deve ser usada pela função de Transferência de Débito entre Quartos, não por um lançamento de pagamento normal.`
    );
  }

  // Parcelamento — lança em Contas a Receber e ainda registra o CashTransaction (mantém a conta
  // da hospedagem batendo), mas sem somar nos totais físicos do caixa.
  if (pm?.installment) {
    const guest = guestId ? await tx.guest.findUnique({ where: { id: guestId } }) : null;
    const billedToCompanyId = guest?.companyId || null;
    const billedToName = billedToCompanyId
      ? (await tx.company.findUnique({ where: { id: billedToCompanyId } }))?.name || guestName
      : guestName;

    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const receivable = await tx.accountsReceivable.create({
      data: {
        tenantId,
        stayCheckinId,
        companyId: billedToCompanyId,
        guestId: guestId || null,
        billedToName,
        documentNumber: `${stayCheckinId}.01.HOS`,
        issueDate,
        dueDate,
        amount,
        paymentMethodDescription,
        notes: description,
      },
    });

    const movimento = await tx.cashTransaction.create({
      data: {
        cashRegisterId,
        type: "ENTRADA",
        amount,
        description: `${description} (Parcelado — Contas a Receber)`,
        paymentMethod: paymentMethodDescription.toUpperCase(),
        countsInCashTotal: false,
        stayCheckinId,
        roomNumber,
        guestName,
      },
    });

    return { cashTransactionId: movimento.id, accountsReceivableId: receivable.id };
  }

  // Debitar Saldo Hóspede — consome o saldo credor do hóspede em vez de dinheiro novo.
  if (pm?.debitGuestBalance) {
    if (!guestId) {
      throw new Error(`Não é possível debitar saldo: hóspede não identificado para esta hospedagem.`);
    }
    const guest = await tx.guest.findUnique({ where: { id: guestId } });
    const saldoAtual = Number(guest?.balance || 0);
    if (saldoAtual < amount) {
      throw new Error(
        `Saldo do cliente insuficiente para debitar: saldo disponível R$ ${saldoAtual.toFixed(2)}, valor solicitado R$ ${amount.toFixed(2)}.`
      );
    }

    await tx.guest.update({ where: { id: guestId }, data: { balance: { decrement: amount } } });
    await tx.guestBalanceEntry.create({
      data: {
        tenantId,
        guestId,
        stayCheckinId,
        type: "DEBITO",
        amount,
        paymentMethodDescription,
        operatorId: operatorId || null,
        operatorName: operatorName || null,
        description,
      },
    });

    const movimento = await tx.cashTransaction.create({
      data: {
        cashRegisterId,
        type: "ENTRADA",
        amount,
        description: `${description} (Debitado do saldo do hóspede)`,
        paymentMethod: paymentMethodDescription.toUpperCase(),
        countsInCashTotal: false,
        stayCheckinId,
        roomNumber,
        guestName,
      },
    });

    return { cashTransactionId: movimento.id };
  }

  // Forma normal — cria o lançamento de caixa respeitando Soma Caixa x Conta Corrente, e credita
  // o saldo do hóspede (regra literal do sistema legado: todo pagamento com forma que não seja
  // "debitar saldo" gera crédito automaticamente).
  const movimento = await tx.cashTransaction.create({
    data: {
      cashRegisterId,
      type: "ENTRADA",
      amount,
      description,
      paymentMethod: paymentMethodDescription.toUpperCase(),
      countsInCashTotal: pm?.sumsToCashRegister ?? true,
      stayCheckinId,
      roomNumber,
      guestName,
    },
  });

  if (guestId) {
    await tx.guest.update({ where: { id: guestId }, data: { balance: { increment: amount } } });
    await tx.guestBalanceEntry.create({
      data: {
        tenantId,
        guestId,
        stayCheckinId,
        type: "CREDITO",
        amount,
        paymentMethodDescription,
        operatorId: operatorId || null,
        operatorName: operatorName || null,
        description,
      },
    });
  }

  return { cashTransactionId: movimento.id };
}
