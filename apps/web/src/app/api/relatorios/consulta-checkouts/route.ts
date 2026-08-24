import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

// "YYYY-MM-DDTHH:mm" (horário já em Brasília, digitado pelo usuário) -> instante UTC correto,
// independente do fuso horário do processo Node — mesma lógica de brasiliaDayRange em
// reservas-por-periodo/route.ts, mas aplicada a um instante exato (data+hora) em vez de a um dia inteiro.
function brasiliaDateTimeToUtc(dateTimeLocal: string): Date {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart || "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

// GET /api/relatorios/consulta-checkouts — hospedagens encerradas cujo check-out real (actualCheckOut)
// caiu dentro do intervalo de data+hora informado.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: "Parâmetros 'from' e 'to' (data+hora) são obrigatórios." },
        { status: 400 }
      );
    }

    const start = brasiliaDateTimeToUtc(from);
    const end = brasiliaDateTimeToUtc(to);

    const stays = await prisma.stayCheckin.findMany({
      where: {
        tenantId: session.tenantId,
        isClosed: true,
        actualCheckOut: { gte: start, lte: end },
      },
      include: { room: true, primaryGuest: true },
      orderBy: { actualCheckOut: "desc" },
    });

    const rows = stays.map((s) => ({
      stayId: s.id,
      roomNumber: s.room?.number || "-",
      guestName: s.primaryGuest?.fullName || "-",
      guestPhone: s.primaryGuest?.whatsappPhone || s.primaryGuest?.phone || "",
      checkInDate: s.checkInDate,
      expectedCheckOut: s.expectedCheckOut,
      actualCheckOut: s.actualCheckOut,
      totalDaily: Number(s.totalDaily),
      totalConsumption: Number(s.totalConsumption),
      otherDebits: Number(s.otherDebits),
      discount: Number(s.discount),
      balanceDue: Number(s.balanceDue),
      closingOperatorName: s.closingOperatorName || "",
    }));

    const hotel = await getTenantHeaderInfo(session.tenantId);

    return NextResponse.json({ success: true, hotel, from, to, checkouts: rows });
  } catch (error: any) {
    console.error("[GET /api/relatorios/consulta-checkouts] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
