import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { findWaitlistVacancy } from "@/lib/waitlistMatch";

// GET /api/waitlist/vacancies — para cada entrada WAITING do tenant, verifica (determinístico, sem
// IA) se já existe um quarto da categoria livre no período. Devolve só os ids das entradas com
// vaga: { entryIds: string[] }. A tela de gestão usa isso para mostrar o selo "Vaga disponível".
// Não é endpoint de polling — a tela chama uma vez ao abrir a aba / após uma ação.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const waiting = await prisma.waitlistEntry.findMany({
      where: { tenantId: session.tenantId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, roomCategoryId: true, checkInDate: true, checkOutDate: true },
      take: 100,
    });

    const entryIds: string[] = [];
    for (const e of waiting) {
      const vacancy = await findWaitlistVacancy(prisma, {
        tenantId: session.tenantId,
        roomCategoryId: e.roomCategoryId,
        checkIn: e.checkInDate,
        checkOut: e.checkOutDate,
        excludeWaitlistId: e.id,
      });
      if (vacancy) entryIds.push(e.id);
    }

    return NextResponse.json({ success: true, entryIds });
  } catch (error: any) {
    console.error("[GET /api/waitlist/vacancies] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao checar vagas." }, { status: 500 });
  }
}
