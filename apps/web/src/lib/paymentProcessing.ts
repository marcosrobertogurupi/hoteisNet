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

export interface ProcessReservationDepositParams {
  tenantId: string;
  cashRegisterId: string;
  reservationNumber: string;
  guestId?: string | null;
  roomNumber?: string | null;
  guestName: string;
  amount: number;
  paymentMethodDescription: string;
  operatorId?: string | null;
  operatorName?: string | null;
}

// Lança o sinal (adiantamento) de uma reserva no caixa do operador NO MOMENTO da criação da
// reserva, honrando as flags da forma escolhida. Diferente do processPaymentLine, aqui NÃO
// existe hospedagem (StayCheckin) ainda: por isso Parcelamento (a AccountsReceivable exige
// stayCheckinId) e Transf.Débito são rejeitados — essas formas só valem no pagamento da
// hospedagem. O CashTransaction criado nasce sem stayCheckinId; no check-in ele é revinculado
// à hospedagem que nasce (ver POST /api/stay/checkin). Ponto único usado por
// POST /api/reservations e POST /api/reservations/batch.
export async function processReservationDeposit(
  tx: TxClient,
  params: ProcessReservationDepositParams
): Promise<{ cashTransactionId: string }> {
  const {
    tenantId,
    cashRegisterId,
    reservationNumber,
    guestId,
    roomNumber,
    guestName,
    amount,
    paymentMethodDescription,
    operatorId,
    operatorName,
  } = params;

  const pm = await tx.paymentMethod.findFirst({
    where: { tenantId, description: { equals: paymentMethodDescription, mode: "insensitive" } },
  });

  if (!pm) {
    throw new Error(
      `A forma de pagamento "${paymentMethodDescription}" não está cadastrada (Central de Cadastros → Formas de Pagamento).`
    );
  }
  if (pm.transferDebit) {
    throw new Error(
      `A forma de pagamento "${pm.description}" (Transf.Débito) não pode ser usada como sinal de reserva — tem fluxo próprio de transferência de débito entre quartos.`
    );
  }
  if (pm.installment) {
    throw new Error(
      `A forma de pagamento "${pm.description}" (parcelamento/fatura) não pode ser usada como sinal de reserva — não há hospedagem para lançar em Contas a Receber. Use-a no pagamento da hospedagem.`
    );
  }

  const descricao = `Adiantamento Reserva ${reservationNumber} - ${guestName}`;

  // Debitar Saldo Hóspede — consome o saldo credor do hóspede em vez de dinheiro novo.
  if (pm.debitGuestBalance) {
    if (!guestId) {
      throw new Error(
        `Não é possível debitar saldo: o sinal usa a forma "${pm.description}", mas a reserva não está vinculada a um hóspede cadastrado.`
      );
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
        type: "DEBITO",
        amount,
        paymentMethodDescription: pm.description,
        operatorId: operatorId || null,
        operatorName: operatorName || null,
        description: descricao,
      },
    });

    const movimento = await tx.cashTransaction.create({
      data: {
        cashRegisterId,
        type: "ENTRADA",
        amount,
        description: `${descricao} (Debitado do saldo do hóspede)`,
        paymentMethod: pm.description.toUpperCase(),
        countsInCashTotal: false,
        roomNumber: roomNumber || null,
        guestName,
      },
    });

    return { cashTransactionId: movimento.id };
  }

  // Forma normal — respeita Soma Caixa x Conta Corrente e credita o saldo do hóspede (mesma
  // regra literal do sistema legado já aplicada no processPaymentLine).
  const movimento = await tx.cashTransaction.create({
    data: {
      cashRegisterId,
      type: "ENTRADA",
      amount,
      description: descricao,
      paymentMethod: pm.description.toUpperCase(),
      countsInCashTotal: pm.sumsToCashRegister ?? true,
      roomNumber: roomNumber || null,
      guestName,
    },
  });

  if (guestId) {
    await tx.guest.update({ where: { id: guestId }, data: { balance: { increment: amount } } });
    await tx.guestBalanceEntry.create({
      data: {
        tenantId,
        guestId,
        type: "CREDITO",
        amount,
        paymentMethodDescription: pm.description,
        operatorId: operatorId || null,
        operatorName: operatorName || null,
        description: descricao,
      },
    });
  }

  return { cashTransactionId: movimento.id };
}

// Estorna (desfaz no caixa e no saldo do hóspede) os adiantamentos já lançados de uma reserva —
// usado ao CANCELAR a reserva, para não deixar dinheiro preso no caixa nem crédito fantasma no
// saldo do hóspede (equivalente ao Qry_DelReservaAdiantCaixa do sistema legado). Parcelamento e
// Transf.Débito não ocorrem no sinal (bloqueados em processReservationDeposit), então só há dois
// efeitos a desfazer: forma normal creditou o saldo do hóspede → debita de volta; "Debitar Saldo
// Hóspede" debitou → credita de volta. Lança se algum sinal já foi revinculado a uma hospedagem
// (check-in já consumiu o adiantamento) — nesse caso o estorno tem de passar pela hospedagem.
export async function reverseReservationDeposits(
  tx: TxClient,
  params: { tenantId: string; reservationId: string; guestId?: string | null }
): Promise<{ reversedCount: number }> {
  const { tenantId, reservationId, guestId } = params;

  const deposits = await tx.reservation_payments.findMany({
    where: { reservationId, cashTransactionId: { not: null } },
    select: { id: true, cashTransactionId: true },
  });

  let reversedCount = 0;
  for (const d of deposits) {
    const ct = await tx.cashTransaction.findUnique({ where: { id: d.cashTransactionId as string } });
    if (!ct) {
      await tx.reservation_payments.update({ where: { id: d.id }, data: { cashTransactionId: null } });
      continue;
    }
    if (ct.stayCheckinId) {
      throw new Error(
        "Esta reserva já teve check-in e o sinal está vinculado à hospedagem. O estorno precisa passar pela tela da hospedagem, não pelo cancelamento da reserva."
      );
    }

    const pm = await tx.paymentMethod.findFirst({
      where: { tenantId, description: { equals: ct.paymentMethod, mode: "insensitive" } },
    });
    const amount = ct.amount;

    if (guestId) {
      const estorna: "CREDITO" | "DEBITO" = pm?.debitGuestBalance ? "CREDITO" : "DEBITO";
      await tx.guest.update({
        where: { id: guestId },
        data: { balance: estorna === "CREDITO" ? { increment: amount } : { decrement: amount } },
      });
      await tx.guestBalanceEntry.create({
        data: {
          tenantId,
          guestId,
          type: estorna,
          amount,
          paymentMethodDescription: ct.paymentMethod,
          description: `Estorno do sinal — reserva ${reservationId} cancelada`,
        },
      });
    }

    await tx.cashTransaction.delete({ where: { id: ct.id } });
    await tx.reservation_payments.update({ where: { id: d.id }, data: { cashTransactionId: null } });
    reversedCount++;
  }

  return { reversedCount };
}
