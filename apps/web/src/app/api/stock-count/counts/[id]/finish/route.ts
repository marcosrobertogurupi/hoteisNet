import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

// POST /api/stock-count/counts/[id]/finish — o funcionário encerra a contagem. Muda o status para
// DONE e trava novas leituras; a contagem fica aguardando o confronto do assinante no painel.
// NÃO altera nenhum saldo de estoque.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { status: true, _count: { select: { items: true } } },
    });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status !== "OPEN") {
      return NextResponse.json({ success: false, error: "Esta contagem já foi finalizada." }, { status: 409 });
    }
    if (count._count.items === 0) {
      return NextResponse.json(
        { success: false, error: "Faça pelo menos uma leitura antes de finalizar." },
        { status: 400 }
      );
    }

    const updated = await prisma.stockCount.updateMany({
      where: { id, tenantId: session.tenantId, status: "OPEN" },
      data: { status: "DONE", finishedAt: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Esta contagem já foi finalizada." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/stock-count/counts/[id]/finish] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao finalizar a contagem." }, { status: 500 });
  }
}
