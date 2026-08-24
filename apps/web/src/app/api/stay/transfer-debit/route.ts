import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

// Forma de pagamento pré-cadastrada usada para "quitar" no quarto de origem o valor que está
// sendo movido para outro quarto — já existia na lista de PRE_REGISTERED_PAYMENT_METHODS do
// LancarPagamentoHospedagemModal, criada especificamente para este fluxo.
const TRANSFER_PAYMENT_METHOD = "TRANSF.DEBITO";

// POST /api/stay/transfer-debit — move (todo ou parte de) o débito de uma hospedagem ativa para
// outra, replicando a tela WIN_TRANSFERENCIADEBITO do sistema WinDev original: o quarto de ORIGEM
// recebe um lançamento de pagamento (forma "TRANSF.DEBITO") que quita aquele valor da sua conta;
// o quarto de DESTINO recebe o mesmo valor como um débito adicional em StayCheckin.otherDebits
// (somado de forma incremental caso já exista débito lançado). Tudo dentro de uma única transação:
// se qualquer parte falhar, nenhum dos dois quartos é alterado.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { operatorId, operatorName, fromStayCheckinId, toStayCheckinId, amount } = body;

    const valorTransferir = Number(amount);
    if (!fromStayCheckinId || !toStayCheckinId) {
      return NextResponse.json(
        { success: false, error: "Hospedagem de origem e de destino são obrigatórias." },
        { status: 400 }
      );
    }
    if (fromStayCheckinId === toStayCheckinId) {
      return NextResponse.json(
        { success: false, error: "O quarto de destino deve ser diferente do quarto de origem." },
        { status: 400 }
      );
    }
    if (!valorTransferir || valorTransferir <= 0) {
      return NextResponse.json(
        { success: false, error: "Informe um valor de transferência maior que zero." },
        { status: 400 }
      );
    }

    const opId = operatorId || "USR-001";
    const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();

    const result = await prisma.$transaction(async (tx) => {
      const [fromStay, toStay] = await Promise.all([
        tx.stayCheckin.findUnique({
          where: { id: fromStayCheckinId },
          include: { room: true, primaryGuest: true },
        }),
        tx.stayCheckin.findUnique({
          where: { id: toStayCheckinId },
          include: { room: true, primaryGuest: true },
        }),
      ]);

      if (!fromStay) throw new Error(`Hospedagem de origem ${fromStayCheckinId} não encontrada.`);
      if (!toStay) throw new Error(`Hospedagem de destino ${toStayCheckinId} não encontrada.`);
      // Ambas as pontas precisam ser do mesmo tenant do operador logado — sem isso, dava para
      // zerar o débito de um quarto às custas do saldo de um hotel diferente (ver relatório de
      // segurança: transferência de débito entre tenants).
      if (fromStay.tenantId !== session.tenantId || toStay.tenantId !== session.tenantId) {
        throw new Error("Hospedagem de origem ou destino não encontrada.");
      }
      if (fromStay.isClosed) throw new Error(`A hospedagem do quarto ${fromStay.room.number} (origem) já está encerrada.`);
      if (toStay.isClosed) throw new Error(`A hospedagem do quarto ${toStay.room.number} (destino) já está encerrada.`);

      // Saldo devedor real da origem, calculado na hora (nunca confiar no snapshot balanceDue,
      // que pode estar desatualizado desde o último pagamento/consumo lançado).
      const [chargesAgg, paymentsAgg] = await Promise.all([
        tx.stayCharge.aggregate({ where: { stayCheckinId: fromStay.id }, _sum: { amount: true } }),
        tx.cashTransaction.aggregate({ where: { stayCheckinId: fromStay.id, type: "ENTRADA" }, _sum: { amount: true } }),
      ]);
      const totalDiariasOrigem = Number(chargesAgg._sum.amount || 0);
      const totalPagoOrigem = Number(paymentsAgg._sum.amount || 0);
      const saldoOrigem =
        totalDiariasOrigem +
        Number(fromStay.totalConsumption) +
        Number(fromStay.otherDebits) -
        totalPagoOrigem -
        Number(fromStay.discount);

      if (valorTransferir > saldoOrigem + 0.01) {
        throw new Error(
          `Valor a transferir (R$ ${valorTransferir.toFixed(2)}) maior que o débito atual do quarto ${fromStay.room.number} (R$ ${saldoOrigem.toFixed(2)}).`
        );
      }

      let caixa = await tx.cashRegister.findFirst({
        where: { operatorId: opId, isOpen: true, tenantId: fromStay.tenantId },
      });
      if (!caixa) {
        caixa = await tx.cashRegister.create({
          data: {
            tenantId: fromStay.tenantId,
            operatorId: opId,
            operatorName: opName,
            openingBalance: 0,
            isOpen: true,
          },
        });
      }

      // Origem: lançamento de pagamento que quita o valor transferido, com a forma pré-cadastrada
      // "TRANSF.DEBITO" — guarda data/hora (createdAt) e o operador (via cashRegister) de quem fez a transferência.
      // countsInCashTotal: false porque nenhum dinheiro novo entrou no caixa aqui — é só a baixa
      // interna do débito do quarto de origem. hiddenFromCashLog: true porque, diferente de
      // Conta Corrente/Parcelamento/Saldo do Hóspede (que ficam visíveis na lista, só não somam),
      // esta transferência não deve aparecer na lista de movimentações do turno de jeito nenhum —
      // nenhum dinheiro mudou de mão ainda; o real lançamento de caixa só acontece quando o
      // quarto de DESTINO pagar de fato (o valor fica em otherDebits, incrementado abaixo).
      await tx.cashTransaction.create({
        data: {
          cashRegisterId: caixa.id,
          type: "ENTRADA",
          amount: valorTransferir,
          description: `Transferência de débito para o quarto ${toStay.room.number} (Hóspede: ${toStay.primaryGuest.fullName})`,
          paymentMethod: TRANSFER_PAYMENT_METHOD,
          countsInCashTotal: false,
          hiddenFromCashLog: true,
          stayCheckinId: fromStay.id,
          roomNumber: fromStay.room.number,
          guestName: fromStay.primaryGuest.fullName,
        },
      });

      // Destino: soma o valor recebido em outrosDebitos (de forma incremental, preservando
      // débitos já existentes lançados por transferências anteriores).
      await tx.stayCheckin.update({
        where: { id: toStay.id },
        data: { otherDebits: { increment: valorTransferir } },
      });

      await tx.stayDebitTransfer.create({
        data: {
          tenantId: fromStay.tenantId,
          fromStayCheckinId: fromStay.id,
          toStayCheckinId: toStay.id,
          amount: valorTransferir,
          operatorId: opId,
          operatorName: opName,
        },
      });

      // Recalcula e persiste os totais consolidados de AMBAS as pontas após a movimentação —
      // mesmo padrão já usado em /api/caixa/pagamento-lote e no checkout.
      const [origemPagamentosAgg, destinoAgg, destinoStayAfter] = await Promise.all([
        tx.cashTransaction.aggregate({ where: { stayCheckinId: fromStay.id, type: "ENTRADA" }, _sum: { amount: true } }),
        tx.stayCharge.aggregate({ where: { stayCheckinId: toStay.id }, _sum: { amount: true } }),
        tx.stayCheckin.findUnique({ where: { id: toStay.id } }),
      ]);
      const totalPagoOrigemFinal = Number(origemPagamentosAgg._sum.amount || 0);
      const saldoOrigemFinal = Math.max(
        0,
        totalDiariasOrigem + Number(fromStay.totalConsumption) + Number(fromStay.otherDebits) - totalPagoOrigemFinal - Number(fromStay.discount)
      );

      const [destinoPagamentosAgg] = await Promise.all([
        tx.cashTransaction.aggregate({ where: { stayCheckinId: toStay.id, type: "ENTRADA" }, _sum: { amount: true } }),
      ]);
      const totalDiariasDestino = Number(destinoAgg._sum.amount || 0);
      const totalPagoDestino = Number(destinoPagamentosAgg._sum.amount || 0);
      const saldoDestinoFinal = Math.max(
        0,
        totalDiariasDestino +
          Number(destinoStayAfter!.totalConsumption) +
          Number(destinoStayAfter!.otherDebits) -
          totalPagoDestino -
          Number(destinoStayAfter!.discount)
      );

      await Promise.all([
        tx.stayCheckin.update({
          where: { id: fromStay.id },
          data: { totalAdvance: totalPagoOrigemFinal, balanceDue: saldoOrigemFinal },
        }),
        tx.stayCheckin.update({
          where: { id: toStay.id },
          data: { balanceDue: saldoDestinoFinal },
        }),
      ]);

      return {
        fromRoomNumber: fromStay.room.number,
        toRoomNumber: toStay.room.number,
        fromGuestName: fromStay.primaryGuest.fullName,
        toGuestName: toStay.primaryGuest.fullName,
        saldoOrigem: saldoOrigemFinal,
        saldoDestino: saldoDestinoFinal,
        tenantId: fromStay.tenantId,
      };
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session?.userId,
      userName: session?.name,
      action: "DEBIT_TRANSFER",
      description: `${session?.name || opName} transferiu R$ ${valorTransferir.toFixed(2)} do quarto ${result.fromRoomNumber} (${result.fromGuestName}) para o quarto ${result.toRoomNumber} (${result.toGuestName}).`,
      entityType: "STAY_CHECKIN",
      entityId: fromStayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
      details: { fromStayCheckinId, toStayCheckinId, amount: valorTransferir },
    });

    return NextResponse.json({
      success: true,
      fromRoomNumber: result.fromRoomNumber,
      toRoomNumber: result.toRoomNumber,
      saldoOrigem: result.saldoOrigem,
      saldoDestino: result.saldoDestino,
      message: `Débito de R$ ${valorTransferir.toFixed(2)} transferido do quarto ${result.fromRoomNumber} para o quarto ${result.toRoomNumber} com sucesso!`,
    });
  } catch (error: any) {
    console.error("[POST /api/stay/transfer-debit] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao transferir débito entre quartos." }, { status: 500 });
  }
}
