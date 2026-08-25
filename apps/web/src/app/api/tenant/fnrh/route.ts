import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { computeFnrhLegalDeadline, friendlyFnrhFailureReason } from "@/lib/snrhosClient";

// Converte uma data "YYYY-MM-DD" escolhida pelo usuário no intervalo [00:00, 24:00) de Brasília —
// mesma lógica de brasiliaDayRange em /api/relatorios/reservas-por-periodo/route.ts.
function brasiliaDayRange(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { start, end };
}

// GET /api/tenant/fnrh?status=PENDING|SENT&from=YYYY-MM-DD&to=YYYY-MM-DD — lista as fichas FNRH do
// tenant da sessão para a tela Tarefas administrativas > Controle de FNRH. PENDING filtra
// opcionalmente pela data de check-in; SENT sempre filtra pela data de transmissão.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") === "SENT" ? "SENT" : "PENDING";
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const reservationFilter: any = { room: { tenantId: session.tenantId } };
    if (status === "PENDING" && fromStr && toStr) {
      const { start } = brasiliaDayRange(fromStr);
      const { end } = brasiliaDayRange(toStr);
      reservationFilter.checkInDate = { gte: start, lt: end };
    }

    const where: any = { transmittedSNRHos: status === "SENT", reservation: reservationFilter };
    if (status === "SENT" && fromStr && toStr) {
      const { start } = brasiliaDayRange(fromStr);
      const { end } = brasiliaDayRange(toStr);
      where.transmittedAt = { gte: start, lt: end };
    }

    const records = await prisma.fNRHRecord.findMany({
      where,
      include: {
        guest: { select: { fullName: true } },
        reservation: { select: { reservationNumber: true, checkInDate: true, checkOutDate: true, room: { select: { number: true } } } },
      },
      orderBy: status === "SENT" ? { transmittedAt: "desc" } : { createdAt: "asc" },
      take: 300,
    });

    const now = new Date();
    const rows = records
      .filter((r) => r.reservation)
      .map((r) => {
        const base = {
          id: r.id,
          guestName: r.guest.fullName,
          roomNumber: r.reservation!.room?.number || "-",
          reservationNumber: r.reservation!.reservationNumber,
          checkInDate: r.reservation!.checkInDate,
          checkOutDate: r.reservation!.checkOutDate,
          transmittedSNRHos: r.transmittedSNRHos,
          transmittedAt: r.transmittedAt,
          snrhosAttempts: r.snrhosAttempts,
          friendlyError: friendlyFnrhFailureReason(r.snrhosLastError),
        };
        if (r.transmittedSNRHos) {
          return { ...base, deadline: null, deadlineHoursLeft: null, overdue: false };
        }
        const { deadline, deadlineExclusive } = computeFnrhLegalDeadline(r.reservation!.checkInDate);
        const deadlineHoursLeft = Math.round((deadlineExclusive.getTime() - now.getTime()) / (60 * 60 * 1000));
        return { ...base, deadline, deadlineHoursLeft, overdue: deadlineHoursLeft <= 0 };
      });

    return NextResponse.json({ success: true, records: rows, count: rows.length });
  } catch (error: any) {
    console.error("[GET /api/tenant/fnrh] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar fichas FNRH." }, { status: 500 });
  }
}
