import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

// POST /api/stock/counts/[id]/cancel — o assinante (admin) descarta uma contagem (OPEN ou DONE)
// sem aplicar nenhum ajuste de saldo. Usado quando a contagem saiu errada / foi só um teste.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;
    const { id } = await params;

    const count = await prisma.stockCount.findFirst({ where: { id, tenantId }, select: { status: true } });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status === "RECONCILED") {
      return NextResponse.json({ success: false, error: "Contagem já confrontada não pode ser cancelada." }, { status: 409 });
    }
    if (count.status === "CANCELLED") {
      return NextResponse.json({ success: true });
    }

    await prisma.stockCount.updateMany({
      where: { id, tenantId, status: { in: ["OPEN", "DONE"] } },
      data: { status: "CANCELLED" },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session!.userId,
        userName: session!.name,
        action: "STOCK_COUNT_CANCEL",
        description: "Contagem de estoque cancelada sem ajuste.",
        entityType: "StockCount",
        entityId: id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/stock/counts/[id]/cancel] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao cancelar." }, { status: 500 });
  }
}
