import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser } from "@/lib/auth";
import { applyMinibarCheck } from "@/lib/minibarCheck";
import { logActivity } from "@/lib/audit";
import { getClientIp, getTerminalName } from "@/lib/auth";

// Conferência do frigobar do quarto abastecido feita pela recepção no check-out.
//
// GET  /api/stay/minibar-check?stayCheckinId=...  → kit da categoria do quarto + se a conferência
//      de check-out já foi feita para esta hospedagem (idempotência da tela).
// POST /api/stay/minibar-check                    → aplica a conferência (source CHECKOUT): gera o
//      consumo do que faltou e baixa o estoque do PDV do frigobar. Deve rodar ANTES do pagamento
//      do check-out, para o consumo entrar no saldo.

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const stayCheckinId = new URL(req.url).searchParams.get("stayCheckinId");
    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const [tenant, stay] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { stockedRoomEnabled: true },
      }),
      prisma.stayCheckin.findFirst({
        where: { id: stayCheckinId, tenantId: session.tenantId },
        select: { id: true, roomId: true, room: { select: { number: true, categoryId: true } } },
      }),
    ]);

    if (!stay) {
      return NextResponse.json({ success: false, error: "Hospedagem não encontrada." }, { status: 404 });
    }
    if (!tenant?.stockedRoomEnabled) {
      return NextResponse.json({ success: true, enabled: false, alreadyDone: false, items: [] });
    }

    const [kit, existingCheck] = await Promise.all([
      prisma.stockedRoomKitItem.findMany({
        where: { tenantId: session.tenantId, roomCategoryId: stay.room.categoryId },
        orderBy: { product: { name: "asc" } },
        select: {
          productId: true,
          parQuantity: true,
          product: { select: { name: true, salePrice: true } },
        },
      }),
      prisma.roomMinibarCheck.findFirst({
        where: { tenantId: session.tenantId, stayCheckinId: stay.id, source: "CHECKOUT" },
        orderBy: { createdAt: "desc" },
        select: { id: true, totalSold: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      enabled: kit.length > 0,
      alreadyDone: !!existingCheck,
      lastCheck: existingCheck
        ? { totalSold: Number(existingCheck.totalSold), createdAt: existingCheck.createdAt }
        : null,
      roomNumber: stay.room.number,
      items: kit.map((k) => ({
        productId: k.productId,
        productName: k.product.name,
        parQuantity: k.parQuantity,
        unitPrice: Number(k.product.salePrice),
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/stay/minibar-check] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar a conferência do frigobar." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const stayCheckinId = String(body.stayCheckinId || "");
    const items: { productId: string; foundQty: number }[] = Array.isArray(body.items) ? body.items : [];
    const operatorId: string | null = body.operatorId ? String(body.operatorId) : session.userId || null;
    const operatorName: string = String(body.operatorName || session.name || "RECEPÇÃO").toUpperCase();

    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const stay = await prisma.stayCheckin.findFirst({
      where: { id: stayCheckinId, tenantId: session.tenantId },
      select: { id: true, roomId: true, isClosed: true, room: { select: { number: true } } },
    });
    if (!stay) {
      return NextResponse.json({ success: false, error: "Hospedagem não encontrada." }, { status: 404 });
    }
    if (stay.isClosed) {
      return NextResponse.json({ success: false, error: "Esta hospedagem já foi encerrada." }, { status: 409 });
    }

    const result = await txWithRetry(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stayCheckinId} FOR UPDATE`;
      return applyMinibarCheck(tx, {
        tenantId: session.tenantId!,
        stayCheckinId,
        roomId: stay.roomId,
        source: "CHECKOUT",
        performedByType: "USER",
        performedById: operatorId,
        performedByName: operatorName,
        found: items,
      });
    });

    if (result.skipped) {
      return NextResponse.json({
        success: false,
        error:
          result.reason === "disabled"
            ? "O recurso de quarto abastecido está desligado nas configurações."
            : "Este quarto não tem kit de frigobar cadastrado para a categoria.",
      }, { status: 409 });
    }

    if (result.totalSold > 0) {
      const linhas = result.soldLines.map((l) => `${l.soldQty}x ${l.productName}`).join(", ");
      await logActivity({
        tenantId: session.tenantId,
        userId: session.userId,
        userName: session.name,
        action: "MINIBAR_CHECK_CHECKOUT",
        description: `${session.name} conferiu o frigobar do quarto ${stay.room.number} no check-out: ${linhas} (R$ ${result.totalSold.toFixed(2)}).`,
        entityType: "STAY_CHECKIN",
        entityId: stayCheckinId,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
    }

    return NextResponse.json({
      success: true,
      totalSold: result.totalSold,
      soldLines: result.soldLines,
      totalConsumption: result.newTotalConsumption ?? null,
    });
  } catch (error: any) {
    console.error("[POST /api/stay/minibar-check] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar a conferência do frigobar." }, { status: 500 });
  }
}
