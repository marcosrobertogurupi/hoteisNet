import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/room-cleaning-history?roomId=&tenantId= — histórico de arrumações (limpeza com
// hóspede no quarto, tipo OCCUPIED) feitas durante a hospedagem ATUAL do quarto, para o menu de
// contexto do Mapa de Quartos ("Histórico de Limpeza"). Escopo pela hospedagem ativa: só mostra
// limpezas concluídas a partir do check-in em vigor, nunca de estadias anteriores.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

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
