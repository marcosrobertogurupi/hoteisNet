import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

function mapConsumption(c: {
  id: string;
  productId: string | null;
  productName: string;
  quantity: any;
  unitPrice: any;
  totalPrice: any;
  posLocationId: string | null;
  operatorName: string | null;
  createdAt: Date;
  posLocation: { name: string } | null;
}) {
  return {
    id: c.id,
    productId: c.productId,
    productName: c.productName,
    quantity: Number(c.quantity),
    unitPrice: Number(c.unitPrice),
    totalPrice: Number(c.totalPrice),
    posLocationId: c.posLocationId,
    posLocationName: c.posLocation?.name || null,
    operatorName: c.operatorName,
    createdAt: c.createdAt,
  };
}

// GET /api/stay/consumo?stayCheckinId=... — lista os itens de consumo já salvos da hospedagem,
// usado para recarregar a grade "Consumo detalhado" da tela de Lançamento de Consumo do Quarto.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stayCheckinId = searchParams.get("stayCheckinId");

    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const stay = await prisma.stayCheckin.findUnique({
      where: { id: stayCheckinId },
      include: { consumptions: { orderBy: { createdAt: "asc" }, include: { posLocation: true } } },
    });

    if (!stay) {
      return NextResponse.json({ success: false, error: "Hospedagem não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      totalConsumption: Number(stay.totalConsumption),
      items: stay.consumptions.map(mapConsumption),
    });
  } catch (error: any) {
    console.error("[GET /api/stay/consumo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar consumo." }, { status: 500 });
  }
}

// POST /api/stay/consumo — lança um item de consumo (minibar/restaurante) na hospedagem ativa do
// quarto e baixa o estoque do PDV escolhido (Restaurante / Bar Recepção / Frigobar). Só é chamado
// no momento em que o usuário confirma "Salvar Lançamentos" (F5) na tela de consumo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      roomId,
      roomNumber,
      stayCheckinId: stayCheckinIdInput,
      productId,
      productName,
      quantity,
      unitPrice,
      posLocationId,
      operatorId,
      operatorName,
    } = body;

    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;

    if (!productName || qty <= 0 || price <= 0) {
      return NextResponse.json(
        { success: false, error: "Item, quantidade e valor unitário são obrigatórios." },
        { status: 400 }
      );
    }

    let stayCheckinId = stayCheckinIdInput as string | undefined;

    if (!stayCheckinId) {
      const roomTarget = String(roomId || roomNumber || "");
      if (!roomTarget) {
        return NextResponse.json({ success: false, error: "Quarto é obrigatório." }, { status: 400 });
      }

      const room = await prisma.room.findFirst({
        where: {
          OR: [{ id: roomTarget }, { number: roomTarget }],
          tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] },
        },
      });

      if (!room) {
        return NextResponse.json({ success: false, error: `Quarto ${roomTarget} não encontrado.` }, { status: 404 });
      }

      const stay = await prisma.stayCheckin.findFirst({
        where: { roomId: room.id, isClosed: false },
        orderBy: { checkInDate: "desc" },
      });

      if (!stay) {
        return NextResponse.json(
          { success: false, error: `Quarto ${room.number} não possui hospedagem ativa para lançar consumo.` },
          { status: 409 }
        );
      }

      stayCheckinId = stay.id;
    }

    const totalPrice = qty * price;

    const result = await prisma.$transaction(async (tx) => {
      // Baixa o estoque do PDV escolhido, quando o item lançado está vinculado a um produto cadastrado.
      if (productId && posLocationId) {
        const stayForTenant = await tx.stayCheckin.findUnique({
          where: { id: stayCheckinId! },
          select: { tenantId: true },
        });
        const tenant = await tx.tenant.findUnique({
          where: { id: stayForTenant!.tenantId },
          select: { allowNegativeStock: true },
        });

        const posStock = await tx.pOSProductStock.findUnique({
          where: { productId_posLocationId: { productId, posLocationId } },
        });
        const available = posStock?.currentStock ?? 0;

        // Se o assinante não marcou "Aceitar estoque negativo" nas configurações, bloqueia a baixa
        // quando o PDV não tem saldo suficiente do produto.
        if (available < qty && !tenant?.allowNegativeStock) {
          throw new Error(`Estoque insuficiente de "${productName}" no PDV selecionado (disponível: ${available}).`);
        }

        await tx.pOSProductStock.upsert({
          where: { productId_posLocationId: { productId, posLocationId } },
          update: { currentStock: { decrement: qty } },
          create: { productId, posLocationId, currentStock: -qty },
        });
      }

      const consumption = await tx.stayConsumption.create({
        data: {
          stayCheckinId: stayCheckinId!,
          productId: productId || null,
          productName,
          quantity: qty,
          unitPrice: price,
          totalPrice,
          posLocationId: posLocationId || null,
          operatorId: operatorId || null,
          operatorName: operatorName || null,
        },
        include: { posLocation: true },
      });

      const updatedStay = await tx.stayCheckin.update({
        where: { id: stayCheckinId! },
        data: { totalConsumption: { increment: totalPrice } },
      });

      return { consumption, updatedStay };
    });

    return NextResponse.json({
      success: true,
      stayCheckinId,
      item: mapConsumption(result.consumption),
      totalConsumption: Number(result.updatedStay.totalConsumption),
    });
  } catch (error: any) {
    console.error("[POST /api/stay/consumo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao lançar consumo." }, { status: 500 });
  }
}

// DELETE /api/stay/consumo — remove um item de consumo já salvo, estornando o estoque do PDV e
// subtraindo o valor do total de consumo (e, por consequência, do débito total do quarto).
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { consumptionId } = body;

    if (!consumptionId) {
      return NextResponse.json({ success: false, error: "consumptionId é obrigatório." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const consumption = await tx.stayConsumption.findUnique({ where: { id: consumptionId } });
      if (!consumption) {
        throw new Error("Lançamento de consumo não encontrado.");
      }

      if (consumption.productId && consumption.posLocationId) {
        // upsert (não update): a baixa original também faz upsert, então o registro de estoque pode
        // não existir ainda se, por algum motivo, tiver sido removido — não pode bloquear o estorno.
        await tx.pOSProductStock.upsert({
          where: {
            productId_posLocationId: { productId: consumption.productId, posLocationId: consumption.posLocationId },
          },
          update: { currentStock: { increment: Number(consumption.quantity) } },
          create: { productId: consumption.productId, posLocationId: consumption.posLocationId, currentStock: Number(consumption.quantity) },
        });
      }

      await tx.stayConsumption.delete({ where: { id: consumptionId } });

      const updatedStay = await tx.stayCheckin.update({
        where: { id: consumption.stayCheckinId },
        data: { totalConsumption: { decrement: consumption.totalPrice } },
      });

      return { updatedStay };
    });

    return NextResponse.json({
      success: true,
      totalConsumption: Number(result.updatedStay.totalConsumption),
    });
  } catch (error: any) {
    console.error("[DELETE /api/stay/consumo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao excluir consumo." }, { status: 500 });
  }
}
