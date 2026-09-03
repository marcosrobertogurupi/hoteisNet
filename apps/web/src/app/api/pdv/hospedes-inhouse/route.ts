import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/pdv/hospedes-inhouse — hóspedes com hospedagem aberta, para "lançar na conta do
// quarto" no PDV. Payload mínimo (quarto, nome, id da hospedagem); nada de cadastro completo.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const stays = await prisma.stayCheckin.findMany({
      where: { tenantId: session.tenantId, isClosed: false, isCanceled: false },
      orderBy: { room: { number: "asc" } },
      select: {
        id: true,
        room: { select: { number: true } },
        primaryGuest: { select: { fullName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      hospedes: stays.map((s) => ({
        stayCheckinId: s.id,
        quarto: s.room?.number ?? "—",
        hospede: s.primaryGuest?.fullName ?? "—",
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/hospedes-inhouse] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
