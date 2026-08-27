import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser } from "@/lib/auth";

// POST /api/cadastros/contas-receber/baixa — registra a baixa (quitação, total ou parcial) de um
// título de contas a receber. Suporta juros/desconto, como a aba "Baixa" do Win_ContasReceber
// original. Quando o valor pago acumulado zera o saldo devedor, marca isPaid=true.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { accountsReceivableId, amount, interest, discount, paymentMethodDescription, operatorId, operatorName } = body;

    if (!accountsReceivableId) {
      return NextResponse.json({ success: false, error: "Título de contas a receber é obrigatório." }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return NextResponse.json({ success: false, error: "Informe um valor de baixa maior que zero." }, { status: 400 });
    }

    const result = await txWithRetry(async (tx) => {
      const receivable = await tx.accountsReceivable.findFirst({ where: { id: accountsReceivableId, tenantId: session.tenantId! } });
      if (!receivable) throw new Error("Título de contas a receber não encontrado.");
      if (receivable.isPaid) throw new Error("Este título já está totalmente quitado.");

      const interestNum = Number(interest) || 0;
      const discountNum = Number(discount) || 0;
      const saldoDevedorAtual = Number(receivable.amount) - Number(receivable.amountPaid);
      const abatimento = amountNum + discountNum;
      if (abatimento > saldoDevedorAtual + 0.01) {
        throw new Error(
          `Valor de baixa (R$ ${abatimento.toFixed(2)}) maior que o saldo devedor do título (R$ ${saldoDevedorAtual.toFixed(2)}).`
        );
      }

      const settlement = await tx.receivableSettlement.create({
        data: {
          accountsReceivableId,
          amount: amountNum,
          interest: interestNum,
          discount: discountNum,
          paymentMethodDescription: paymentMethodDescription || "DINHEIRO",
          operatorId: operatorId || null,
          operatorName: operatorName || null,
        },
      });

      const novoAmountPaid = Number(receivable.amountPaid) + amountNum + discountNum;
      const quitado = novoAmountPaid + 0.01 >= Number(receivable.amount);

      const updated = await tx.accountsReceivable.update({
        where: { id: accountsReceivableId },
        data: {
          amountPaid: novoAmountPaid,
          isPaid: quitado,
          paidAt: quitado ? new Date() : null,
        },
      });

      return { settlement, receivable: updated };
    });

    return NextResponse.json({
      success: true,
      settlement: result.settlement,
      receivable: result.receivable,
      message: result.receivable.isPaid ? "Título quitado com sucesso." : "Baixa parcial registrada com sucesso.",
    });
  } catch (error: any) {
    console.error("[POST /api/cadastros/contas-receber/baixa] Erro ao registrar baixa:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar baixa." }, { status: 500 });
  }
}
