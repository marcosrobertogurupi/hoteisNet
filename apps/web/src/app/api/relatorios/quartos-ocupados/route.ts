import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/relatorios/quartos-ocupados — quartos ocupados agora, com a soma de pessoas hospedadas
// (hóspede principal + acompanhantes), para dimensionar o café da manhã.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEFAULT_TENANT_ID;

    const rooms = await prisma.room.findMany({
      where: { tenantId, status: "OCCUPIED", active: true },
      include: {
        checkins: {
          where: { isClosed: false },
          orderBy: { checkInDate: "desc" },
          take: 1,
          include: {
            primaryGuest: true,
            secondaryGuests: true,
            reservation: { select: { adults: true, children: true } },
          },
        },
      },
    });

    const rows = rooms
      .map((r) => {
        const stay = r.checkins[0];
        // Fonte principal: Qtd Adultos + Qtd Crianças gravados na própria StayCheckin no momento
        // do check-in (campo dedicado desde já). Para hospedagens antigas, criadas antes desse
        // campo existir, ele vem com o valor padrão (1 adulto, 0 crianças) mesmo que a hospedagem
        // tenha mais gente — por isso ainda comparamos com os acompanhantes nomeados (StayGuest) e
        // com os adultos/crianças da reserva de origem, usando sempre a maior contagem disponível.
        const fromCheckin = stay ? (stay.adults ?? 1) + (stay.children ?? 0) : 0;
        const fromCompanions = stay ? 1 + (stay.secondaryGuests?.length || 0) : 0;
        const fromReservation = stay?.reservation
          ? (stay.reservation.adults ?? 0) + (stay.reservation.children ?? 0)
          : 0;
        const pessoas = Math.max(fromCheckin, fromCompanions, fromReservation, 1);
        return {
          id: r.id,
          number: r.number,
          guestName: stay?.primaryGuest?.fullName || "-",
          pessoas,
          checkInDate: stay?.checkInDate || null,
          expectedCheckOut: stay?.expectedCheckOut || null,
        };
      })
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

    const totalPessoas = rows.reduce((sum, r) => sum + r.pessoas, 0);
    const hotel = await getTenantHeaderInfo(tenantId);

    return NextResponse.json({
      success: true,
      hotel,
      rooms: rows,
      totalQuartos: rows.length,
      totalPessoas,
    });
  } catch (error: any) {
    console.error("[GET /api/relatorios/quartos-ocupados] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
