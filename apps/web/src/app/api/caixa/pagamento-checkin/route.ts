import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { processPaymentLine } from "@/lib/paymentProcessing";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/caixa/pagamento-checkin — lança um crédito/pagamento na hospedagem ativa do quarto
// E, ao mesmo tempo, registra o movimento no caixa aberto do operador ativo (equivalente ao
// Cai_LanPor/HospedagemPagto.HosP_IDOperador do sistema WinDev original).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      operatorId,
      operatorName,
      roomId,
      stayCheckinId,
      guestName,
      valor,
      formaPagamento,
      descricao,
    } = body;

    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) {
      return NextResponse.json({ success: false, error: "Valor do pagamento deve ser maior que zero." }, { status: 400 });
    }

    const opId = operatorId || "USR-001";
    const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();
    const fpg = formaPagamento || "DINHEIRO";
    const roomTarget = String(roomId || "");

    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    // Resolve a hospedagem ativa: usa o stayCheckinId informado se for um ID real do banco,
    // senão localiza pela hospedagem aberta do quarto (fallback para dados legados/mock).
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

    // Encontra o caixa aberto do operador ativo; abre automaticamente um novo se não houver nenhum.
    let caixa = await prisma.cashRegister.findFirst({
      where: { operatorId: opId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
    });

    if (!caixa) {
      caixa = await prisma.cashRegister.create({
        data: {
          tenantId: tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
          operatorId: opId,
          operatorName: opName,
          openingBalance: 0,
          isOpen: true,
        },
      });
    }

    if (!stay) {
      return NextResponse.json({ success: false, error: "Hospedagem não encontrada para lançar o pagamento." }, { status: 404 });
    }

    const desc = descricao || `Pagamento de diárias — Quarto ${roomTarget}`;

    const { cashTransactionId } = await prisma.$transaction((tx) =>
      processPaymentLine(tx, {
        tenantId: stay!.tenantId,
        cashRegisterId: caixa.id,
        stayCheckinId: stay!.id,
        guestId: stay!.primaryGuestId,
        roomNumber: roomTarget,
        guestName: guestName || "",
        amount: valorNum,
        paymentMethodDescription: fpg,
        description: `${desc} (Hóspede: ${guestName || "—"})`,
        operatorId: opId,
        operatorName: opName,
      })
    );
    const movimento = { id: cashTransactionId! };

    // Saldo devedor atualizado da hospedagem, se localizada no banco
    let saldoContaQuarto: number | null = null;
    if (stay) {
      const [charges, payments] = await Promise.all([
        prisma.stayCharge.aggregate({ where: { stayCheckinId: stay.id }, _sum: { amount: true } }),
        prisma.cashTransaction.aggregate({ where: { stayCheckinId: stay.id, type: "ENTRADA" }, _sum: { amount: true } }),
      ]);
      const totalDiarias = Number(charges._sum.amount || 0);
      const totalConsumo = Number(stay.totalConsumption);
      const totalPago = Number(payments._sum.amount || 0);
      saldoContaQuarto = Math.max(0, totalDiarias + totalConsumo - totalPago);
    }

    const session = await getSessionUser(req);
    await logActivity({
      tenantId: session?.tenantId || tenantIdsToSearch[0] || DEFAULT_TENANT_ID,
      userId: session?.userId,
      userName: session?.name,
      action: "PAYMENT",
      description: `${session?.name || opName} lançou pagamento de R$ ${valorNum.toFixed(2)} (${fpg}) — quarto ${roomTarget}, hóspede ${guestName || "—"}.`,
      entityType: "CASH_TRANSACTION",
      entityId: movimento.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      movimentoCaixaId: movimento.id,
      caixaId: caixa.id,
      operatorId: opId,
      operatorName: opName,
      saldoContaQuarto,
      message: `Pagamento de R$ ${valorNum.toFixed(2)} (${fpg}) lançado com sucesso no Caixa de ${opName}!`,
    });
  } catch (error: any) {
    console.error("[POST /api/caixa/pagamento-checkin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao lançar pagamento." }, { status: 500 });
  }
}
