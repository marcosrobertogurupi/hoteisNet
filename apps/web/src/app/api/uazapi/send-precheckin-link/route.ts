import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPreCheckinLink } from "@/lib/preCheckinSender";

// POST /api/uazapi/send-precheckin-link — dispara manualmente (botão "Disparar Wpp Uazapi" na
// Grade de Reservas) o link de pré-check-in/FNRH da reserva via WhatsApp.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { reservationId } = body;

    if (!reservationId) {
      return NextResponse.json({ success: false, error: "Reserva é obrigatória." }, { status: 400 });
    }

    // reservation.room.tenantId é o tenant real (ver comentário em lib/preCheckinSender.ts).
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { room: { select: { tenantId: true } } },
    });
    if (!reservation || reservation.room.tenantId !== session.tenantId) {
      return NextResponse.json({ success: false, error: "Reserva não encontrada." }, { status: 404 });
    }

    const result = await sendPreCheckinLink(reservationId);
    if (!result.success) {
      return NextResponse.json(result, { status: result.unreachable ? 503 : 400 });
    }

    return NextResponse.json({ success: true, message: "Link de pré-check-in enviado com sucesso via WhatsApp!" });
  } catch (error: any) {
    console.error("[Send Pre-Checkin Link Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
