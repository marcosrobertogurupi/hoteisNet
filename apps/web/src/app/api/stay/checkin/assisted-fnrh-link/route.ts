import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser } from "@/lib/auth";
import { createPreCheckinLink } from "@/lib/preCheckinLink";
import { logActivity } from "@/lib/audit";
import { validateCPF, formatCPF } from "@/lib/documentValidation";

// POST /api/stay/checkin/assisted-fnrh-link — gera o link de pré-check-in/FNRH SEM enviar por
// WhatsApp, para o "Preenchimento Assistido no Balcão": o atendente abre o mesmo formulário do
// hóspede aqui no dispositivo da recepção, para casos em que o hóspede não tem/domina celular
// (ex.: hóspede idoso). Reaproveita o mesmo token/URL/formulário do fluxo normal — só muda a forma
// de entrega. Previsto pelo MTur como "preenchimento assistido" (FAQ da FNRH Digital).
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { reservationId, documentNumber, guestName, phone } = body;
    if (!reservationId) {
      return NextResponse.json({ success: false, error: "Reserva é obrigatória." }, { status: 400 });
    }

    // reservation.room.tenantId é o tenant real (convenção histórica — ver preCheckinSender.ts).
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, guestName: true, guestCpf: true, checkInDate: true, room: { select: { tenantId: true } } },
    });
    if (!reservation || reservation.room.tenantId !== session.tenantId) {
      return NextResponse.json({ success: false, error: "Reserva não encontrada." }, { status: 404 });
    }

    // A reserva de origem quase sempre não tem CPF gravado (o hóspede só informa o documento aqui,
    // no balcão, ao iniciar o check-in). Persistimos o CPF digitado no modal na própria reserva
    // antes de gerar a ficha — o CPF é a chave de consulta ao Hub do governo.
    if (!reservation.guestCpf) {
      const documentDigits = (documentNumber || "").replace(/\D/g, "");
      if (documentDigits.length !== 11 || !validateCPF(documentDigits)) {
        return NextResponse.json({ success: false, error: "CPF do hóspede é obrigatório para gerar a FNRH." }, { status: 400 });
      }
      await prisma.reservation.updateMany({
        where: { id: reservation.id, room: { tenantId: session.tenantId } },
        data: {
          guestCpf: formatCPF(documentDigits),
          ...(guestName ? { guestName: String(guestName).toUpperCase() } : {}),
          ...(phone ? { guestPhone: String(phone) } : {}),
        },
      });
    }

    const tenantId = reservation.room.tenantId;
    const { url } = await txWithRetry((tx) =>
      createPreCheckinLink(tx, { tenantId, reservationId: reservation.id, checkInDate: reservation.checkInDate })
    );

    await prisma.reservation.update({ where: { id: reservation.id }, data: { preCheckinSent: true } });

    await logActivity({
      tenantId,
      action: "PRE_CHECKIN_LINK_ASSISTED",
      entityType: "Reservation",
      entityId: reservation.id,
      description: `Link de pré-check-in FNRH gerado para preenchimento assistido no balcão (${reservation.guestName}).`,
    });

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    console.error("[Assisted FNRH Link Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
