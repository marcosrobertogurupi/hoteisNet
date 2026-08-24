import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { validateCPF, formatCPF } from "@/lib/documentValidation";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

// Status de reserva que já representam uma hospedagem em curso ou encerrada — nunca reaproveitar
// (mesma lista usada em POST /api/stay/checkin).
const RESERVATION_STATUSES_NOT_MATCHABLE = ["CANCELLED", "CHECKED_IN", "CHECKED_OUT"] as const;

// POST /api/stay/checkin/draft-reservation — usado pelo modal de check-in avulso (sem reserva de
// origem) para conseguir um reservationId ANTES do check-in em si, só para poder anexar o link de
// FNRH/pré-check-in a alguma coisa (PreCheckinLink.reservationId é obrigatório no schema). Reaproveita
// a mesma heurística de "adoção" de reserva do dia já usada em POST /api/stay/checkin, para que o
// check-in final naturalmente encontre e finalize esta MESMA reserva em vez de criar uma segunda.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { roomId, roomNumber, guestName, documentNumber, phone, checkInDate, checkOutDate } = body;

    const roomTarget = String(roomId || roomNumber || "");
    if (!roomTarget || !guestName) {
      return NextResponse.json(
        { success: false, error: "Quarto e nome do hóspede são obrigatórios para enviar a FNRH." },
        { status: 400 }
      );
    }

    // CPF é sempre obrigatório (mesmo no preenchimento assistido sem telefone) porque é a chave
    // usada na consulta ao Hub de Desenvolvedor do governo — sem CPF válido não há como localizar
    // o hóspede na base nacional.
    const documentDigits = (documentNumber || "").replace(/\D/g, "");
    if (documentDigits.length !== 11 || !validateCPF(documentDigits)) {
      return NextResponse.json({ success: false, error: "CPF válido é obrigatório para enviar a FNRH." }, { status: 400 });
    }
    const cpf = formatCPF(documentDigits);

    const room = await prisma.room.findFirst({
      where: { OR: [{ id: roomTarget }, { number: roomTarget }], tenantId: session.tenantId },
    });
    if (!room) {
      return NextResponse.json({ success: false, error: `Quarto ${roomTarget} não encontrado.` }, { status: 404 });
    }

    const checkInAt = checkInDate ? new Date(checkInDate) : new Date();
    const checkOutAt = checkOutDate ? new Date(checkOutDate) : new Date(checkInAt.getTime() + 24 * 60 * 60 * 1000);

    const todayStart = dateOnlyBrasilia(new Date());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const existing = await prisma.reservation.findFirst({
      where: {
        roomId: room.id,
        status: { notIn: RESERVATION_STATUSES_NOT_MATCHABLE as any },
        checkInDate: { gte: todayStart, lt: todayEnd },
      },
      orderBy: { checkInDate: "asc" },
    });

    const reservation = existing
      ? await prisma.reservation.update({
          where: { id: existing.id },
          data: {
            guestName: String(guestName).toUpperCase(),
            guestCpf: cpf || undefined,
            guestPhone: phone,
          },
        })
      : await prisma.reservation.create({
          data: {
            // Reservas sempre vivem sob o tenant "TNT-01" nesta base, independente do tenant do
            // quarto (convenção histórica dos demais endpoints — ver POST /api/stay/checkin).
            tenantId: "TNT-01",
            roomId: room.id,
            guestName: String(guestName).toUpperCase(),
            guestCpf: cpf,
            guestPhone: phone,
            checkInDate: checkInAt,
            checkOutDate: checkOutAt,
            dailyRate: 0,
            totalDiarias: 0,
            totalAmount: 0,
            status: "PRE_RESERVATION",
            reservationNumber: "RES-" + String(Math.floor(500 + Math.random() * 9000)),
          },
        });

    return NextResponse.json({ success: true, reservationId: reservation.id });
  } catch (error: any) {
    console.error("[POST /api/stay/checkin/draft-reservation] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao preparar envio da FNRH." },
      { status: 500 }
    );
  }
}
