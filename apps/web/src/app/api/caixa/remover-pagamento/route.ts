import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Mesma constante usada em /api/stay/transfer-debit — forma pré-cadastrada usada para "quitar" no
// quarto de origem o valor movido para outro quarto.
const TRANSFER_PAYMENT_METHOD = "TRANSF.DEBITO";

// DELETE /api/caixa/remover-pagamento — exclui um lançamento de crédito/pagamento da hospedagem e
// do movimento de caixa correspondente, revertendo simetricamente TODOS os efeitos colaterais que
// a criação daquele lançamento pode ter causado (ver apps/web/src/lib/paymentProcessing.ts e
// apps/web/src/app/api/stay/transfer-debit/route.ts):
//   1. Pagamento normal — creditou Guest.balance automaticamente -> reverte debitando de volta.
//   2. "Debitar Saldo Hóspede" — debitou Guest.balance -> reverte creditando de volta.
//   3. Parcelamento — criou um AccountsReceivable -> cancela a fatura (bloqueia se já baixada).
//   4. "TRANSF.DEBITO" — incrementou otherDebits do StayCheckin de DESTINO -> reverte decrementando.
// Em todos os casos o estorno de saldo do hóspede é registrado como um novo GuestBalanceEntry (nunca
// apagamos o histórico existente). Se não for possível identificar com segurança qual efeito
// colateral reverter (caso ambíguo), a remoção é bloqueada com uma mensagem clara em vez de
// arriscar corromper dados financeiros.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { caixaMovimentoId } = body;

    if (!caixaMovimentoId) {
      return NextResponse.json({ success: false, error: "caixaMovimentoId é obrigatório." }, { status: 400 });
    }

    await txWithRetry(async (tx) => {
      const ct = await tx.cashTransaction.findUnique({
        where: { id: caixaMovimentoId },
        include: { stay: true, cashRegister: { select: { tenantId: true } } },
      });

      if (!ct) {
        // Lançamento pode já ter sido removido ou nunca ter sido persistido (dado legado/mock) — não é fatal.
        return;
      }

      // CashTransaction não tem tenantId direto — chega via stay (quando vinculada a uma
      // hospedagem) ou sempre via o caixa (CashRegister) que a contém. Confere os dois.
      const ownerTenantId = ct.stay?.tenantId || ct.cashRegister.tenantId;
      if (ownerTenantId !== session!.tenantId) {
        throw new Error("Lançamento não encontrado.");
      }

      const stay = ct.stay;
      const amount = ct.amount;

      // Descobre as flags da forma de pagamento cadastrada — mesma consulta usada em
      // processPaymentLine ao CRIAR o lançamento, para saber qual efeito colateral desfazer.
      const pm = stay
        ? await tx.paymentMethod.findFirst({
            where: { tenantId: stay.tenantId, description: { equals: ct.paymentMethod, mode: "insensitive" } },
          })
        : null;

      const isTransferDebit = ct.paymentMethod === TRANSFER_PAYMENT_METHOD || !!pm?.transferDebit;
      const isInstallment = !isTransferDebit && !!pm?.installment;
      const isGuestBalanceDebit = !isTransferDebit && !isInstallment && !!pm?.debitGuestBalance;

      if (isTransferDebit) {
        if (!stay) {
          throw new Error(
            "Não foi possível localizar a hospedagem de origem desta transferência de débito. Remoção bloqueada para evitar inconsistência."
          );
        }

        // Não há FK direta entre CashTransaction e StayDebitTransfer, então a correlação é feita por
        // hospedagem de origem + valor + horário de criação (ambos os registros são criados na MESMA
        // transação Prisma em /api/stay/transfer-debit, então createdAt costuma bater exatamente).
        const candidates = await tx.stayDebitTransfer.findMany({
          where: { tenantId: stay.tenantId, fromStayCheckinId: stay.id, amount },
        });

        if (candidates.length === 0) {
          throw new Error(
            "Não foi possível localizar o registro da transferência de débito correspondente a este lançamento. Remoção bloqueada — reverta manualmente o débito em \"Outros Débitos\" do quarto de destino, se necessário."
          );
        }

        let transfer = candidates.find((c) => c.createdAt.getTime() === ct.createdAt.getTime());
        if (!transfer) {
          if (candidates.length === 1) {
            transfer = candidates[0];
          } else {
            const sorted = [...candidates].sort(
              (a, b) =>
                Math.abs(a.createdAt.getTime() - ct.createdAt.getTime()) -
                Math.abs(b.createdAt.getTime() - ct.createdAt.getTime())
            );
            const diff0 = Math.abs(sorted[0].createdAt.getTime() - ct.createdAt.getTime());
            const diff1 = Math.abs(sorted[1].createdAt.getTime() - ct.createdAt.getTime());
            // Só aceita o candidato mais próximo se estiver dentro de uma janela curta e não houver
            // empate com o segundo mais próximo — caso contrário é genuinamente ambíguo.
            if (diff0 <= 2000 && diff1 - diff0 > 1) {
              transfer = sorted[0];
            }
          }
        }

        if (!transfer) {
          throw new Error(
            `Existem ${candidates.length} transferências de débito de R$ ${Number(amount).toFixed(2)} feitas a partir deste quarto, e não foi possível identificar com segurança qual delas corresponde a este lançamento. Remoção bloqueada para não corromper o débito do quarto de destino — reverta manualmente pela tela de Transferência de Débitos.`
          );
        }

        const destStay = await tx.stayCheckin.findUnique({ where: { id: transfer.toStayCheckinId } });
        if (destStay) {
          const novoOtherDebits = Math.max(0, Number(destStay.otherDebits) - Number(transfer.amount));
          await tx.stayCheckin.update({
            where: { id: destStay.id },
            data: { otherDebits: novoOtherDebits },
          });
        }
        // O registro StayDebitTransfer em si é mantido como trilha de auditoria permanente (ver
        // comentário no schema.prisma) — só o efeito em otherDebits do destino é revertido.
      } else if (isInstallment) {
        if (!stay) {
          throw new Error(
            "Não foi possível localizar a hospedagem vinculada a esta fatura parcelada. Remoção bloqueada."
          );
        }

        const receivables = await tx.accountsReceivable.findMany({
          where: { stayCheckinId: stay.id, amount },
        });

        if (receivables.length > 1) {
          throw new Error(
            "Existe mais de uma fatura (Contas a Receber) com o mesmo valor vinculada a esta hospedagem, e não foi possível identificar com segurança qual delas corresponde a este lançamento. Remoção bloqueada — cancele a fatura manualmente na tela de Contas a Receber antes de excluir este pagamento."
          );
        }

        const receivable = receivables[0];
        if (receivable) {
          if (receivable.isPaid || Number(receivable.amountPaid) > 0) {
            throw new Error(
              `Não é possível excluir este lançamento: a fatura "${receivable.documentNumber}" vinculada já foi paga/baixada (total ou parcialmente). Estorne a baixa na tela de Contas a Receber antes de remover este pagamento.`
            );
          }
          await tx.accountsReceivable.delete({ where: { id: receivable.id } });
        }
      } else if (isGuestBalanceDebit) {
        if (!stay) {
          throw new Error(
            "Não foi possível localizar a hospedagem/hóspede vinculado a este débito de saldo. Remoção bloqueada."
          );
        }

        await tx.guest.update({
          where: { id: stay.primaryGuestId },
          data: { balance: { increment: amount } },
        });
        await tx.guestBalanceEntry.create({
          data: {
            tenantId: stay.tenantId,
            guestId: stay.primaryGuestId,
            stayCheckinId: stay.id,
            type: "CREDITO",
            amount,
            paymentMethodDescription: ct.paymentMethod,
            description: `Estorno por exclusão do lançamento de caixa: ${ct.description}`,
          },
        });
      } else if (stay) {
        // Pagamento normal — creditou automaticamente o saldo do hóspede na criação (regra literal
        // do sistema legado: toda forma que não seja "debitar saldo" gera crédito). Reverte debitando.
        await tx.guest.update({
          where: { id: stay.primaryGuestId },
          data: { balance: { decrement: amount } },
        });
        await tx.guestBalanceEntry.create({
          data: {
            tenantId: stay.tenantId,
            guestId: stay.primaryGuestId,
            stayCheckinId: stay.id,
            type: "DEBITO",
            amount,
            paymentMethodDescription: ct.paymentMethod,
            description: `Estorno por exclusão do lançamento de caixa: ${ct.description}`,
          },
        });
      }

      await tx.cashTransaction.delete({ where: { id: caixaMovimentoId } });
    });

    return NextResponse.json({
      success: true,
      message: "Lançamento removido da conta e conferência do caixa.",
    });
  } catch (error: any) {
    console.error("[DELETE /api/caixa/remover-pagamento] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover pagamento." }, { status: 500 });
  }
}
