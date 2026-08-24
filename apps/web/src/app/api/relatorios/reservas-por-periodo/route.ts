import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

// Converte uma data "YYYY-MM-DD" escolhida pelo usuário no intervalo [00:00, 24:00) de Brasília
// (UTC-3 fixo), independente do fuso horário do processo Node — mesma lógica de
// src/lib/brasiliaDate.ts, aplicada aqui a um intervalo de dia em vez de a um único instante.
function brasiliaDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { start, end };
}

// GET /api/relatorios/reservas-por-periodo — reservas cuja previsão de chegada cai na data informada
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");

    if (!dateStr) {
      return NextResponse.json({ success: false, error: "Parâmetro 'date' é obrigatório." }, { status: 400 });
    }

    const { start, end } = brasiliaDayRange(dateStr);

    // O módulo de Reservas grava tenantId="TNT-01" fixo por convenção (ver RESERVATION_TENANT_ID
    // em /api/reservations/route.ts) — o tenant real de cada reserva é sempre o do quarto
    // (reservation.room.tenantId), nunca Reservation.tenantId.
    const reservations = await prisma.reservation.findMany({
      where: {
        room: { tenantId: session.tenantId },
        checkInDate: { gte: start, lt: end },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: { room: true },
    });

    const rows = reservations
      .map((r) => {
        const nights = Math.max(
          1,
          Math.round((r.checkOutDate.getTime() - r.checkInDate.getTime()) / 86400000)
        );
        return {
          id: r.id,
          roomNumber: r.room?.number || "-",
          guestName: r.guestName,
          guestPhone: r.guestPhone || "",
          checkInDate: r.checkInDate,
          checkOutDate: r.checkOutDate,
          nights,
          adults: r.adults ?? 1,
          status: r.status,
        };
      })
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    const hotel = await getTenantHeaderInfo(session.tenantId);

    return NextResponse.json({ success: true, hotel, date: dateStr, reservations: rows });
  } catch (error: any) {
    console.error("[GET /api/relatorios/reservas-por-periodo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
