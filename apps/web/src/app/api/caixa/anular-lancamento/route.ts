import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { gateCriticalEvent, releaseCriticalAuthorization, formatBRL, describeStay } from "@/lib/criticalAuth";

// Mesma constante usada em /api/stay/transfer-debit — forma pré-cadastrada usada para "quitar" no
// quarto de origem o valor movido para outro quarto.
const TRANSFER_PAYMENT_METHOD = "TRANSF.DEBITO";

class AnnulError extends Error {}

// POST /api/caixa/anular-lancamento — ANULA um lançamento de crédito/pagamento da hospedagem.
//
// Regra do negócio (definida pelo usuário, 29/09/2026): lançamento de caixa NUNCA é excluído.
// Anulado, ele continua no caixa para consulta, mas não soma nem diminui o saldo: fica com
// annulledAt/annulledBy*, countsInCashTotal=false e a descrição marcada "[ANULADO]"; todo
// somatório de pagamentos da hospedagem filtra annulledAt: null. Até 29/09/2026 esta rota era
// DELETE /api/caixa/remover-pagamento e apagava a linha do caixa.
//
// Evento crítico ANULAR_LANCAMENTO_CAIXA: exige autorização de um autorizador (lib/criticalAuth.ts)
// — o operador autorizador passa direto, os demais passam pela janela de autorização.
//
// Reverte simetricamente TODOS os efeitos colaterais que a criação do lançamento causou (ver
// apps/web/src/lib/paymentProcessing.ts e apps/web/src/app/api/stay/transfer-debit/route.ts):
//   1. Pagamento normal — creditou Guest.balance automaticamente -> reverte debitando de volta.
//   2. "Debitar Saldo Hóspede" — debitou Guest.balance -> reverte creditando de volta.
//   3. Parcelamento — criou um AccountsReceivable -> cancela a fatura (bloqueia se já baixada).
//   4. "TRANSF.DEBITO" — incrementou otherDebits do StayCheckin de DESTINO -> reverte decrementando.
// Em todos os casos o estorno de saldo do hóspede é registrado como um novo GuestBalanceEntry (nunca
// apagamos o histórico existente). Se não for possível identificar com segurança qual efeito
// colateral reverter (caso ambíguo), a anulação é bloqueada com uma mensagem clara em vez de
// arriscar corromper dados financeiros.
export async function POST(req: NextRequest) {
  let gateToRelease: { tenantId: string; id: string; channel: string } | null = null;
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const body = await req.json();
    const caixaMovimentoId = String(body.caixaMovimentoId || "");
    if (!caixaMovimentoId) {
      return NextResponse.json({ success: false, error: "caixaMovimentoId é obrigatório." }, { status: 400 });
    }

    // CashTransaction não tem tenantId direto — chega pelo caixa (CashRegister) que a contém.
    const alvo = await prisma.cashTransaction.findFirst({
      where: { id: caixaMovimentoId, cashRegister: { tenantId } },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        createdAt: true,
        roomNumber: true,
        guestName: true,
        annulledAt: true,
        stayCheckinId: true,
        cashRegister: { select: { operatorName: true } },
      },
    });
    if (!alvo) {
      return NextResponse.json({ success: false, error: "Lançamento não encontrado." }, { status: 404 });
    }
    if (alvo.annulledAt) {
      return NextResponse.json({ success: false, error: "Este lançamento já foi anulado." }, { status: 409 });
    }
    if (!alvo.stayCheckinId) {
      return NextResponse.json(
        { success: false, error: "Por enquanto só lançamentos de hospedagem podem ser anulados por aqui." },
        { status: 400 }
      );
    }

    // Quarto/hóspede ATUAIS da hospedagem: o roomNumber gravado no lançamento é o do momento do
    // pagamento (ex.: adiantamento feito antes de uma transferência de quarto).
    const atual = await describeStay(tenantId, alvo.stayCheckinId);
    const quartoAtual = atual.Quarto || alvo.roomNumber || "-";
    const gate = await gateCriticalEvent(req, session, {
      eventType: "ANULAR_LANCAMENTO_CAIXA",
      fingerprint: { cashTransactionId: alvo.id },
      summary: `Anular lançamento de ${formatBRL(Number(alvo.amount))} (${alvo.paymentMethod}) no caixa — quarto ${quartoAtual}.`,
      details: {
        Quarto: quartoAtual,
        ...(alvo.roomNumber && alvo.roomNumber !== quartoAtual ? { "Quarto no lançamento": alvo.roomNumber } : {}),
        Hóspede: atual.Hóspede || alvo.guestName || "-",
        Valor: formatBRL(Number(alvo.amount)),
        "Forma de pagamento": alvo.paymentMethod,
        "Lançado em": alvo.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        "Lançado por": alvo.cashRegister.operatorName || "-",
      },
      authorizationId: body.authorizationId,
    });
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });
    gateToRelease = { tenantId, id: gate.authorizationId, channel: gate.channel };
    const annulReason = gate.justification || (body.motivo ? String(body.motivo).trim().slice(0, 500) : null);

    const result = await txWithRetry(async (tx) => {
      // Trava a linha da hospedagem pelo resto da transação — serializa com o check-out e com os
      // lançamentos de pagamento (mesmo lock). Sem isto, anular um pagamento enquanto o check-out
      // fecha em outro terminal deixa o fechamento com um total defasado.
      await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${alvo.stayCheckinId} FOR UPDATE`;

      // Anula primeiro, condicionado a ainda não estar anulado: dois terminais anulando o mesmo
      // lançamento ao mesmo tempo nunca revertem os efeitos colaterais duas vezes.
      const ct = await tx.cashTransaction.findFirst({
        where: { id: caixaMovimentoId },
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          description: true,
          createdAt: true,
          guestName: true,
          roomNumber: true,
          stay: { select: { id: true, tenantId: true, primaryGuestId: true } },
        },
      });
      if (!ct?.stay || ct.stay.tenantId !== tenantId) throw new AnnulError("Lançamento não encontrado.");
      const marked = await tx.cashTransaction.updateMany({
        where: { id: ct.id, annulledAt: null },
        data: {
          annulledAt: new Date(),
          annulledById: gate.authorizedBy.id,
          annulledByName: gate.authorizedBy.name,
          annulReason,
          annulAuthorizationId: gate.authorizationId,
          countsInCashTotal: false,
          description: `[ANULADO] ${ct.description}`,
        },
      });
      if (marked.count === 0) throw new AnnulError("Este lançamento já foi anulado.");

      const stay = ct.stay;
      const amount = ct.amount;

      // Descobre as flags da forma de pagamento cadastrada — mesma consulta usada em
      // processPaymentLine ao CRIAR o lançamento, para saber qual efeito colateral desfazer.
      const pm = await tx.paymentMethod.findFirst({
        where: { tenantId: stay.tenantId, description: { equals: ct.paymentMethod, mode: "insensitive" } },
        select: { transferDebit: true, installment: true, debitGuestBalance: true },
      });

      const isTransferDebit = ct.paymentMethod === TRANSFER_PAYMENT_METHOD || !!pm?.transferDebit;
      const isInstallment = !isTransferDebit && !!pm?.installment;
      const isGuestBalanceDebit = !isTransferDebit && !isInstallment && !!pm?.debitGuestBalance;

      if (isTransferDebit) {
        if (!stay) {
          throw new AnnulError(
            "Não foi possível localizar a hospedagem de origem desta transferência de débito. Anulação bloqueada para evitar inconsistência."
          );
        }

        // Não há FK direta entre CashTransaction e StayDebitTransfer, então a correlação é feita por
        // hospedagem de origem + valor + horário de criação (ambos os registros são criados na MESMA
        // transação Prisma em /api/stay/transfer-debit, então createdAt costuma bater exatamente).
        const candidates = await tx.stayDebitTransfer.findMany({
          where: { tenantId: stay.tenantId, fromStayCheckinId: stay.id, amount },
          select: { id: true, amount: true, createdAt: true, toStayCheckinId: true },
        });

        if (candidates.length === 0) {
          throw new AnnulError(
            "Não foi possível localizar o registro da transferência de débito correspondente a este lançamento. Anulação bloqueada — reverta manualmente o débito em \"Outros Débitos\" do quarto de destino, se necessário."
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
          throw new AnnulError(
            `Existem ${candidates.length} transferências de débito de R$ ${Number(amount).toFixed(2)} feitas a partir deste quarto, e não foi possível identificar com segurança qual delas corresponde a este lançamento. Anulação bloqueada para não corromper o débito do quarto de destino — reverta manualmente pela tela de Transferência de Débitos.`
          );
        }

        const destStay = await tx.stayCheckin.findFirst({
          where: { id: transfer.toStayCheckinId, tenantId },
          select: { id: true, otherDebits: true },
        });
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
          throw new AnnulError(
            "Não foi possível localizar a hospedagem vinculada a esta fatura parcelada. Anulação bloqueada."
          );
        }

        const receivables = await tx.accountsReceivable.findMany({
          where: { stayCheckinId: stay.id, amount },
          select: { id: true, isPaid: true, amountPaid: true, documentNumber: true },
        });

        if (receivables.length > 1) {
          throw new AnnulError(
            "Existe mais de uma fatura (Contas a Receber) com o mesmo valor vinculada a esta hospedagem, e não foi possível identificar com segurança qual delas corresponde a este lançamento. Anulação bloqueada — cancele a fatura manualmente na tela de Contas a Receber antes de anular este pagamento."
          );
        }

        const receivable = receivables[0];
        if (receivable) {
          if (receivable.isPaid || Number(receivable.amountPaid) > 0) {
            throw new AnnulError(
              `Não é possível anular este lançamento: a fatura "${receivable.documentNumber}" vinculada já foi paga/baixada (total ou parcialmente). Estorne a baixa na tela de Contas a Receber antes de anular este pagamento.`
            );
          }
          await tx.accountsReceivable.delete({ where: { id: receivable.id } });
        }
      } else if (isGuestBalanceDebit) {
        if (!stay) {
          throw new AnnulError(
            "Não foi possível localizar a hospedagem/hóspede vinculado a este débito de saldo. Anulação bloqueada."
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
            description: `Estorno por anulação do lançamento de caixa: ${ct.description}`,
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
            description: `Estorno por anulação do lançamento de caixa: ${ct.description}`,
          },
        });
      }

      // Recalcula e persiste o snapshot financeiro da hospedagem — sem isto a tela do quarto
      // continua mostrando o saldo antigo (quitado) depois de anular um pagamento.
      const [charges, payments, fresh] = await Promise.all([
        tx.stayCharge.aggregate({ where: { stayCheckinId: stay.id }, _sum: { amount: true } }),
        tx.cashTransaction.aggregate({ where: { stayCheckinId: stay.id, type: "ENTRADA", annulledAt: null }, _sum: { amount: true } }),
        tx.stayCheckin.findUnique({
          where: { id: stay.id },
          select: { isClosed: true, totalConsumption: true, discount: true, otherDebits: true },
        }),
      ]);
      const totalPago = Number(payments._sum.amount || 0);
      const saldo = Math.max(
        0,
        Number(charges._sum.amount || 0) +
          Number(fresh?.totalConsumption || 0) +
          Number(fresh?.otherDebits || 0) -
          totalPago -
          Number(fresh?.discount || 0)
      );
      await tx.stayCheckin.update({
        where: { id: stay.id },
        data: { totalAdvance: totalPago, balanceDue: saldo },
        select: { id: true },
      });
      return { stayId: stay.id, isClosed: !!fresh?.isClosed, saldo, amount: Number(amount), guestName: ct.guestName, roomNumber: ct.roomNumber };
    });

    await logActivity({
      tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PAYMENT_ANNUL",
      description:
        `${session.name} anulou um lançamento de caixa de R$ ${result.amount.toFixed(2)} da hospedagem` +
        (result.roomNumber ? ` (quarto ${result.roomNumber}` : "") +
        (result.guestName ? `, hóspede ${result.guestName})` : result.roomNumber ? ")" : "") +
        (gate.channel === "PROPRIO" ? "" : `, autorizado por ${gate.authorizedBy.name}`) +
        `. Novo saldo devedor: R$ ${result.saldo.toFixed(2)}.` +
        (result.isClosed ? " ATENÇÃO: a hospedagem já estava encerrada — o check-out ficou com saldo em aberto." : ""),
      entityType: "STAY_CHECKIN",
      entityId: result.stayId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
      details: { cashTransactionId: caixaMovimentoId, authorizationId: gate.authorizationId },
    });

    return NextResponse.json({
      success: true,
      message: result.isClosed
        ? "Lançamento anulado. Atenção: esta hospedagem já estava encerrada — o check-out ficou com saldo em aberto."
        : "Lançamento anulado. Ele continua visível no caixa, mas não soma mais no saldo.",
      stayClosed: result.isClosed,
      saldoContaQuarto: result.saldo,
    });
  } catch (error: any) {
    if (gateToRelease) await releaseCriticalAuthorization(gateToRelease.tenantId, gateToRelease.id, gateToRelease.channel);
    console.error("[POST /api/caixa/anular-lancamento] Erro:", error);
    const status = error instanceof AnnulError ? 409 : 500;
    return NextResponse.json({ success: false, error: error.message || "Erro ao anular lançamento." }, { status });
  }
}
