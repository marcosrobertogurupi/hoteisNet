import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { sendPreCheckinLink } from "@/lib/preCheckinSender";

// GET /api/uazapi/send-precheckin-link?reservationId=... — status do envio/preenchimento da FNRH,
// usado pelo polling do modal de check-in enquanto aguarda o hóspede preencher e assinar a ficha.
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const reservationId = new URL(request.url).searchParams.get("reservationId");
    if (!reservationId) {
      return NextResponse.json({ success: false, error: "Reserva é obrigatória." }, { status: 400 });
    }

    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, room: { tenantId: session.tenantId } },
      select: { preCheckinSent: true, fnrhRecords: { select: { id: true } } },
    });
    if (!reservation) {
      return NextResponse.json({ success: false, error: "Reserva não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      preCheckinSent: reservation.preCheckinSent,
      fnrhCompleted: reservation.fnrhRecords.length > 0,
    });
  } catch (error: any) {
    console.error("[GET Send Pre-Checkin Link Status Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

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
