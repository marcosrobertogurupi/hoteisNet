import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/room-cleaning-history?roomId= — histórico de arrumações (limpeza com
// hóspede no quarto, tipo OCCUPIED) feitas durante a hospedagem ATUAL do quarto, para o menu de
// contexto do Mapa de Quartos ("Histórico de Limpeza"). Escopo pela hospedagem ativa: só mostra
// limpezas concluídas a partir do check-in em vigor, nunca de estadias anteriores.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId");
    if (!roomId) {
      return NextResponse.json({ success: false, error: "Quarto não informado." }, { status: 400 });
    }

    const activeStay = await prisma.stayCheckin.findFirst({
      where: { roomId, tenantId: resolvedTenantId, isClosed: false },
      select: { id: true, checkInDate: true },
    });

    if (!activeStay) {
      return NextResponse.json({ success: true, hasActiveStay: false, cleanings: [] });
    }

    const cleanings = await prisma.housekeepingTask.findMany({
      where: {
        tenantId: resolvedTenantId,
        roomId,
        type: "OCCUPIED",
        status: "DONE",
        finishedAt: { gte: activeStay.checkInDate },
      },
      select: {
        id: true,
        finishedAt: true,
        notes: true,
        housekeeper: { select: { name: true } },
      },
      orderBy: { finishedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      hasActiveStay: true,
      cleanings: cleanings.map((c) => ({
        id: c.id,
        housekeeperName: c.housekeeper?.name || "—",
        finishedAt: c.finishedAt,
        notes: c.notes,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/room-cleaning-history] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar histórico de limpeza." },
      { status: 500 }
    );
  }
}
