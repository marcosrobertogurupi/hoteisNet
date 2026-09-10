import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperUser } from "@/lib/housekeeperSession";
import { prisma } from "@/lib/prisma";

// GET /api/housekeeping/rooms/[roomId]/minibar-kit — kit do frigobar do quarto (recurso "quarto
// abastecido"), consultado uma vez quando a governanta abre a tela do quarto numa arrumação com
// hóspede. Fora do polling da lista (mantém o payload de /api/housekeeping/rooms enxuto).
//
// Devolve enabled=false quando o recurso está desligado no tenant, o quarto não tem hospedagem
// ativa, ou a categoria do quarto não tem kit cadastrado — nesses casos o app não mostra a
// conferência.
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const session = await getHousekeeperUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    const { roomId } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { stockedRoomEnabled: true },
    });
    if (!tenant?.stockedRoomEnabled) {
      return NextResponse.json({ success: true, enabled: false, items: [] });
    }

    const room = await prisma.room.findFirst({
      where: { id: roomId, tenantId: session.tenantId },
      select: { id: true, categoryId: true },
    });
    if (!room) {
      return NextResponse.json({ success: true, enabled: false, items: [] });
    }

    const stay = await prisma.stayCheckin.findFirst({
      where: { roomId: room.id, isClosed: false, tenantId: session.tenantId },
      orderBy: { checkInDate: "desc" },
      select: { id: true },
    });
    if (!stay) {
      return NextResponse.json({ success: true, enabled: false, items: [] });
    }

    const kit = await prisma.stockedRoomKitItem.findMany({
      where: { tenantId: session.tenantId, roomCategoryId: room.categoryId },
      orderBy: { product: { name: "asc" } },
      select: {
        productId: true,
        parQuantity: true,
        product: { select: { name: true, salePrice: true } },
      },
    });
    if (kit.length === 0) {
      return NextResponse.json({ success: true, enabled: false, items: [] });
    }

    return NextResponse.json({
      success: true,
      enabled: true,
      stayCheckinId: stay.id,
      items: kit.map((k) => ({
        productId: k.productId,
        productName: k.product.name,
        parQuantity: k.parQuantity,
        unitPrice: Number(k.product.salePrice),
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/housekeeping/rooms/[roomId]/minibar-kit] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar o kit do frigobar." },
      { status: 500 }
    );
  }
}
