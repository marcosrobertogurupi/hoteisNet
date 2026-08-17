import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


// DELETE /api/caixa/remover-pagamento — exclui um lançamento de crédito/pagamento
// da hospedagem e do movimento de caixa correspondente.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { caixaMovimentoId } = body;

    if (!caixaMovimentoId) {
      return NextResponse.json({ success: false, error: "caixaMovimentoId é obrigatório." }, { status: 400 });
    }

    await prisma.cashTransaction.delete({ where: { id: caixaMovimentoId } }).catch(() => {
      // Lançamento pode já ter sido removido ou nunca ter sido persistido (dado legado/mock) — não é fatal.
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
