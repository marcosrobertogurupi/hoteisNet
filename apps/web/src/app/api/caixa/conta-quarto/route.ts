import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


// GET /api/caixa/conta-quarto?stayCheckinId=... — lista os pagamentos/créditos já lançados
// na hospedagem, para que o modal de pagamento reflita o histórico real ao ser reaberto.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stayCheckinId = searchParams.get("stayCheckinId");

    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const movimentos = await prisma.cashTransaction.findMany({
      where: { stayCheckinId, type: "ENTRADA" },
      orderBy: { createdAt: "desc" },
      include: { cashRegister: true },
    });

    const payments = movimentos.map((m) => ({
      id: m.id,
      date: `${new Intl.DateTimeFormat("pt-BR").format(m.createdAt)} ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(m.createdAt)}`,
      amount: Number(m.amount),
      methodDescription: m.paymentMethod,
      operatorName: m.cashRegister.operatorName,
      caixaMovimentoId: m.id,
    }));

    const totalPago = payments.reduce((acc, p) => acc + p.amount, 0);

    return NextResponse.json({ success: true, payments, totalPago });
  } catch (error: any) {
    console.error("[GET /api/caixa/conta-quarto] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar conta do quarto." }, { status: 500 });
  }
}
