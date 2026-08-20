import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/cadastros/contas-pagar/baixa — registra a baixa (quitação, total ou parcial) de um
// título de contas a pagar. Suporta juros/desconto, no mesmo padrão da baixa de Contas a Receber.
// Quando o valor pago acumulado zera o saldo devedor, marca isPaid=true.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountsPayableId, amount, paidAt, interest, discount, paymentMethodDescription, operatorId, operatorName } = body;

    if (!accountsPayableId) {
      return NextResponse.json({ success: false, error: "Título de contas a pagar é obrigatório." }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return NextResponse.json({ success: false, error: "Informe um valor de baixa maior que zero." }, { status: 400 });
    }
    // paidAt vem de um <input type="date"> ("YYYY-MM-DD"); ancora em meio-dia UTC para evitar que
    // a conversão de fuso horário jogue a data para o dia anterior/seguinte (ver GuestBalanceEntry
    // e memória do projeto sobre lógica de data em America/Sao_Paulo).
    const paidAtDate = paidAt ? new Date(`${paidAt}T12:00:00Z`) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.findUnique({ where: { id: accountsPayableId } });
      if (!payable) throw new Error("Título de contas a pagar não encontrado.");
      if (payable.isPaid) throw new Error("Este título já está totalmente quitado.");

      const interestNum = Number(interest) || 0;
      const discountNum = Number(discount) || 0;
      const saldoDevedorAtual = Number(payable.amount) - Number(payable.amountPaid);
      const abatimento = amountNum + discountNum;
      if (abatimento > saldoDevedorAtual + 0.01) {
        throw new Error(
          `Valor de baixa (R$ ${abatimento.toFixed(2)}) maior que o saldo devedor do título (R$ ${saldoDevedorAtual.toFixed(2)}).`
        );
      }

      const settlement = await tx.payableSettlement.create({
        data: {
          accountsPayableId,
          amount: amountNum,
          interest: interestNum,
          discount: discountNum,
          paymentMethodDescription: paymentMethodDescription || "DINHEIRO",
          paidAt: paidAtDate,
          operatorId: operatorId || null,
          operatorName: operatorName || null,
        },
      });

      const novoAmountPaid = Number(payable.amountPaid) + amountNum + discountNum;
      const quitado = novoAmountPaid + 0.01 >= Number(payable.amount);

      const updated = await tx.accountsPayable.update({
        where: { id: accountsPayableId },
        data: {
          amountPaid: novoAmountPaid,
          isPaid: quitado,
          paidAt: quitado ? paidAtDate : null,
        },
      });

      return { settlement, payable: updated };
    });

    return NextResponse.json({
      success: true,
      settlement: result.settlement,
      payable: result.payable,
      message: result.payable.isPaid ? "Título quitado com sucesso." : "Baixa parcial registrada com sucesso.",
    });
  } catch (error: any) {
    console.error("[POST /api/cadastros/contas-pagar/baixa] Erro ao registrar baixa:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar baixa." }, { status: 500 });
  }
}
