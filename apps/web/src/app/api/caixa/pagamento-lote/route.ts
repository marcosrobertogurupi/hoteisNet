import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { processPaymentLine } from "@/lib/paymentProcessing";
import { verifyAdminStepUp } from "@/lib/adminAuth";
import { resolveOperator } from "@/lib/operator";

// POST /api/caixa/pagamento-lote — grava, em uma única transação, todos os lançamentos de
// crédito/pagamento pendentes da hospedagem no caixa do operador ativo. Espelha o comportamento
// do sistema WinDev original (BTN_FinalizarHospedagem): os lançamentos feitos com o botão "+"
// ficam apenas na grade local (não vão pro caixa) até o usuário clicar em "Salvar Crédito" —
// só então tudo é persistido de uma vez, atomicamente (se um item falhar, nada é gravado).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { roomId, stayCheckinId, guestName, payments, discount } = body;

    const hasPayments = Array.isArray(payments) && payments.length > 0;
    const hasDiscountUpdate = discount !== undefined && discount !== null;

    if (!hasPayments && !hasDiscountUpdate) {
      return NextResponse.json({ success: true, movimentos: [], saldoContaQuarto: null });
    }

    // Operador = usuário autenticado (nunca o operatorId do body — ver lib/operator.ts).
    const { operatorId: opId, operatorName: opName } = resolveOperator(session);
    const roomTarget = String(roomId || "");

    let stay = stayCheckinId
      ? await prisma.stayCheckin.findFirst({ where: { id: stayCheckinId, tenantId: session.tenantId } })
      : null;

    if (!stay && roomTarget) {
      const room = await prisma.room.findFirst({
        where: { OR: [{ id: roomTarget }, { number: roomTarget }], tenantId: session.tenantId },
      });
      if (room) {
        stay = await prisma.stayCheckin.findFirst({
          where: { roomId: room.id, isClosed: false },
          orderBy: { checkInDate: "desc" },
        });
      }
    }

    // Desconto acima do limite (Tenant.maxDiscountPercent, Configurações) exige autorização de
    // administrador — checagem AUTORITATIVA no servidor, nunca confiar no que a tela já validou
    // (a UI pode ter sido burlada). Mesmo padrão de /api/pdv/atendimentos/[id] (verifyAdminStepUp).
    const discountValue = hasDiscountUpdate ? Math.max(0, Number(discount) || 0) : 0;
    if (hasDiscountUpdate && discountValue > 0 && stay) {
      const chargesAgg = await prisma.stayCharge.aggregate({
        where: { stayCheckinId: stay.id },
        _sum: { amount: true },
      });
      const subtotal = Number(chargesAgg._sum.amount || 0) + Number(stay.totalConsumption) + Number(stay.otherDebits);
      const discountPercent = subtotal > 0 ? (discountValue / subtotal) * 100 : 100;

      const tenant = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { maxDiscountPercent: true },
      });
      const limite = Number(tenant?.maxDiscountPercent ?? 20);

      if (discountPercent > limite + 0.001) {
        const auth = await verifyAdminStepUp(req, body.adminEmail, body.adminPassword, session.tenantId);
        if (!auth.ok) {
          return NextResponse.json(
            { success: false, error: auth.error, precisaAutorizacao: true, limitePercent: limite },
            { status: auth.status }
          );
        }
      }
    }

    const { movimentos, saldoContaQuarto } = await txWithRetry(async (tx) => {
      const created: { clientId: string; movimentoCaixaId: string }[] = [];

      if (hasPayments && !stay) {
        throw new Error("Hospedagem não encontrada para lançar o pagamento.");
      }

      // Trava a linha da hospedagem pelo resto da transação — o mesmo lock que o check-out
      // adquire (ver /api/stay/checkin PATCH). Sem isto, este pagamento e o fechamento do
      // check-out num outro terminal correm sem se serializar (o check-out escreve só na
      // stay_checkins, este só na cash_transactions), e o check-out pode fechar usando um total
      // de pagamentos desatualizado. Depois do lock, reconfere que a hospedagem não fechou.
      if (stay) {
        await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stay.id} FOR UPDATE`;
        const fresh = await tx.stayCheckin.findUnique({
          where: { id: stay.id },
          select: { isClosed: true },
        });
        if (fresh?.isClosed) {
          throw new Error("Esta hospedagem já foi encerrada — não é possível lançar novos pagamentos.");
        }
      }

      if (hasPayments) {
        let caixa = await tx.cashRegister.findFirst({
          where: { operatorId: opId, isOpen: true, tenantId: session.tenantId! },
        });

        if (!caixa) {
          caixa = await tx.cashRegister.create({
            data: {
              tenantId: session.tenantId!,
              operatorId: opId,
              operatorName: opName,
              openingBalance: 0,
              isOpen: true,
            },
          });
        }

        for (const p of payments) {
          const valorNum = Number(p.valor);
          if (!valorNum || valorNum <= 0) {
            throw new Error(`Valor de pagamento inválido: ${p.valor}`);
          }
          const fpg = p.formaPagamento || "DINHEIRO";
          const desc = p.descricao || `Pagamento de diárias — Quarto ${roomTarget}`;

          const { cashTransactionId } = await processPaymentLine(tx, {
            tenantId: stay?.tenantId || session.tenantId!,
            cashRegisterId: caixa.id,
            stayCheckinId: stay?.id || "",
            guestId: stay?.primaryGuestId || null,
            roomNumber: roomTarget,
            guestName: guestName || "",
            amount: valorNum,
            paymentMethodDescription: fpg,
            description: `${desc} (Hóspede: ${guestName || "—"})`,
            operatorId: opId,
            operatorName: opName,
          });
          if (cashTransactionId) {
            created.push({ clientId: p.clientId, movimentoCaixaId: cashTransactionId });
          }
        }
      }

      if (hasDiscountUpdate && stay) {
        await tx.stayCheckin.update({
          where: { id: stay.id, tenantId: session.tenantId! },
          data: { discount: discountValue },
        });
      }

      // Snapshot financeiro recalculado e persistido DENTRO da mesma transação (antes ficava em
      // consultas soltas depois do commit, reabrindo a janela de corrida com o check-out).
      let saldo: number | null = null;
      if (stay) {
        const [charges, paymentsAgg, stayAfter] = await Promise.all([
          tx.stayCharge.aggregate({ where: { stayCheckinId: stay.id }, _sum: { amount: true } }),
          tx.cashTransaction.aggregate({ where: { stayCheckinId: stay.id, type: "ENTRADA" }, _sum: { amount: true } }),
          tx.stayCheckin.findUnique({ where: { id: stay.id }, select: { totalConsumption: true, discount: true, otherDebits: true } }),
        ]);
        const totalDiarias = Number(charges._sum.amount || 0);
        const totalConsumo = Number(stayAfter?.totalConsumption || 0);
        const totalPago = Number(paymentsAgg._sum.amount || 0);
        const totalDesconto = Number(stayAfter?.discount || 0);
        const totalOutrosDebitos = Number(stayAfter?.otherDebits || 0);
        saldo = Math.max(0, totalDiarias + totalConsumo + totalOutrosDebitos - totalPago - totalDesconto);

        // Equivalentes a hpd_totaladiant / hpd_saldopagar do sistema legado.
        await tx.stayCheckin.update({
          where: { id: stay.id, tenantId: session.tenantId! },
          data: { totalAdvance: totalPago, balanceDue: saldo },
        });
      }

      return { movimentos: created, saldoContaQuarto: saldo };
    });

    const totalLote = hasPayments ? payments.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0) : 0;
    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PAYMENT",
      description: `${session?.name || opName} lançou ${movimentos.length} pagamento(s) totalizando R$ ${totalLote.toFixed(2)} — quarto ${roomTarget}, hóspede ${guestName || "—"}.`,
      entityType: "CASH_TRANSACTION",
      entityId: stay?.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
      details: { movimentos },
    });

    return NextResponse.json({
      success: true,
      movimentos,
      caixaOperatorName: opName,
      saldoContaQuarto,
      message: `${movimentos.length} lançamento(s) gravado(s) com sucesso no Caixa de ${opName}!`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/pagamento-lote] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao gravar lançamentos no caixa." }, { status: 500 });
  }
}
