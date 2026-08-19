import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/caixa/pagamento-lote — grava, em uma única transação, todos os lançamentos de
// crédito/pagamento pendentes da hospedagem no caixa do operador ativo. Espelha o comportamento
// do sistema WinDev original (BTN_FinalizarHospedagem): os lançamentos feitos com o botão "+"
// ficam apenas na grade local (não vão pro caixa) até o usuário clicar em "Salvar Crédito" —
// só então tudo é persistido de uma vez, atomicamente (se um item falhar, nada é gravado).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, operatorId, operatorName, roomId, stayCheckinId, guestName, payments, discount } = body;

    const hasPayments = Array.isArray(payments) && payments.length > 0;
    const hasDiscountUpdate = discount !== undefined && discount !== null;

    if (!hasPayments && !hasDiscountUpdate) {
      return NextResponse.json({ success: true, movimentos: [], saldoContaQuarto: null });
    }

    const opId = operatorId || "USR-001";
    const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();
    const roomTarget = String(roomId || "");
    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    let stay = stayCheckinId
      ? await prisma.stayCheckin.findUnique({ where: { id: stayCheckinId } })
      : null;

    if (!stay && roomTarget) {
      const room = await prisma.room.findFirst({
        where: { OR: [{ id: roomTarget }, { number: roomTarget }], tenantId: { in: tenantIdsToSearch } },
      });
      if (room) {
        stay = await prisma.stayCheckin.findFirst({
          where: { roomId: room.id, isClosed: false },
          orderBy: { checkInDate: "desc" },
        });
      }
    }

    const movimentos = await prisma.$transaction(async (tx) => {
      const created: { clientId: string; movimentoCaixaId: string }[] = [];

      if (hasPayments) {
        let caixa = await tx.cashRegister.findFirst({
          where: { operatorId: opId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
        });

        if (!caixa) {
          caixa = await tx.cashRegister.create({
            data: {
              tenantId: tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
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
          const fpg = (p.formaPagamento || "DINHEIRO").toUpperCase();
          const desc = p.descricao || `Pagamento de diárias — Quarto ${roomTarget}`;

          const movimento = await tx.cashTransaction.create({
            data: {
              cashRegisterId: caixa.id,
              type: "ENTRADA",
              amount: valorNum,
              description: `${desc} (Hóspede: ${guestName || "—"})`,
              paymentMethod: fpg,
              stayCheckinId: stay?.id,
              roomNumber: roomTarget,
              guestName: guestName || "",
            },
          });
          created.push({ clientId: p.clientId, movimentoCaixaId: movimento.id });
        }
      }

      if (hasDiscountUpdate && stay) {
        await tx.stayCheckin.update({
          where: { id: stay.id },
          data: { discount: Math.max(0, Number(discount) || 0) },
        });
      }

      return created;
    });

    let saldoContaQuarto: number | null = null;
    if (stay) {
      const [charges, paymentsAgg, stayAfter] = await Promise.all([
        prisma.stayCharge.aggregate({ where: { stayCheckinId: stay.id }, _sum: { amount: true } }),
        prisma.cashTransaction.aggregate({ where: { stayCheckinId: stay.id, type: "ENTRADA" }, _sum: { amount: true } }),
        prisma.stayCheckin.findUnique({ where: { id: stay.id }, select: { discount: true, otherDebits: true } }),
      ]);
      const totalDiarias = Number(charges._sum.amount || 0);
      const totalConsumo = Number(stay.totalConsumption);
      const totalPago = Number(paymentsAgg._sum.amount || 0);
      const totalDesconto = Number(stayAfter?.discount || 0);
      const totalOutrosDebitos = Number(stayAfter?.otherDebits || 0);
      saldoContaQuarto = Math.max(0, totalDiarias + totalConsumo + totalOutrosDebitos - totalPago - totalDesconto);

      // Mantém o snapshot financeiro da hospedagem atualizado a cada lançamento de caixa, não só
      // no check-out final — equivalentes a hpd_totaladiant e hpd_saldopagar do sistema legado.
      await prisma.stayCheckin.update({
        where: { id: stay.id },
        data: { totalAdvance: totalPago, balanceDue: saldoContaQuarto },
      });
    }

    const session = await getSessionUser(req);
    const totalLote = hasPayments ? payments.reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0) : 0;
    await logActivity({
      tenantId: session?.tenantId || tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
      userId: session?.userId,
      userName: session?.name,
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
