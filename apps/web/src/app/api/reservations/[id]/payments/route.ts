import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/reservations/[id]/payments — adiantamentos (sinal) já lançados nesta reserva.
// Consumido UMA vez pelo modal de check-in (não é polling) para mostrar o que o hóspede já
// pagou na reserva e com qual forma. Isolamento por tenant via reservation.room.tenantId
// (convenção RESERVATION_TENANT_ID — a Reservation em si vive sob "TNT-01").
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;

    const reservation = await prisma.reservation.findFirst({
      where: { id, room: { tenantId: session.tenantId } },
      select: { id: true },
    });
    if (!reservation) {
      return NextResponse.json({ success: false, error: "Reserva não encontrada." }, { status: 404 });
    }

    const rows = await prisma.reservation_payments.findMany({
      where: { reservationId: id },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        operatorName: true,
        createdAt: true,
        cashTransactionId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const payments = rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod || "DINHEIRO",
      operatorName: r.operatorName,
      createdAt: r.createdAt,
      // true = sinal já lançado no caixa na criação da reserva (nada a re-lançar no check-in).
      postedToCashRegister: !!r.cashTransactionId,
    }));

    return NextResponse.json({ success: true, payments });
  } catch (error: any) {
    console.error("[GET /api/reservations/[id]/payments] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
