import { NextResponse } from "next/server";
import { sendPreCheckinLink } from "@/lib/preCheckinSender";

// POST /api/uazapi/send-precheckin-link — dispara manualmente (botão "Disparar Wpp Uazapi" na
// Grade de Reservas) o link de pré-check-in/FNRH da reserva via WhatsApp.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reservationId } = body;

    if (!reservationId) {
      return NextResponse.json({ success: false, error: "Reserva é obrigatória." }, { status: 400 });
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
