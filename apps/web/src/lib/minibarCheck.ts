import type { Prisma } from "@prisma/client";

// Aplica uma conferência do frigobar ("quarto abastecido") dentro de uma transação já aberta.
// Compartilhado por:
//  - POST /api/housekeeping/tasks/[id]/finish  (governanta conclui a arrumação com hóspede)
//  - POST /api/stay/minibar-check              (recepção, no check-out)
//
// A pessoa informa a QUANTIDADE ENCONTRADA de cada item do kit; aqui calculamos vendido = par -
// encontrado. Cada item com vendido > 0 vira um StayConsumption (mesma mecânica de
// /api/stay/consumo: baixa o estoque do PDV do frigobar respeitando Tenant.allowNegativeStock e
// soma em StayCheckin.totalConsumption). Toda conferência gera um RoomMinibarCheck + itens, mesmo
// quando nada foi vendido (prova de que a conferência aconteceu).
//
// Uma conferência de CHECKOUT é PROVISÓRIA até o check-out ser realmente concluído: se a recepção
// abre o check-out, confere e sai sem finalizar, na próxima vez a conferência anterior é ESTORNADA
// e refeita a partir do kit cheio — o hóspede pode ter consumido mais nesse meio-tempo, e a
// baseline no check-out é sempre "frigobar reabastecido na última limpeza". Conferências de
// CLEANING (governanta) nunca são estornadas — representam consumo real entre arrumações.
//
// IMPORTANTE: o chamador deve ter travado a linha da hospedagem antes
// (`SELECT id FROM stay_checkins WHERE id = ... FOR UPDATE`), igual ao check-out e ao consumo.

export interface MinibarFoundInput {
  productId: string;
  foundQty: number;
}

export interface ApplyMinibarCheckArgs {
  tenantId: string;
  stayCheckinId: string;
  roomId: string;
  source: "CLEANING" | "CHECKOUT";
  housekeepingTaskId?: string | null;
  performedByType: "HOUSEKEEPER" | "USER";
  performedById?: string | null;
  performedByName?: string | null;
  found: MinibarFoundInput[];
}

export interface ApplyMinibarCheckResult {
  skipped: boolean;
  reason?: "disabled" | "no-kit";
  checkId?: string;
  totalSold: number;
  soldLines: { productName: string; soldQty: number; totalPrice: number }[];
  newTotalConsumption?: number;
}

export async function applyMinibarCheck(
  tx: Prisma.TransactionClient,
  args: ApplyMinibarCheckArgs
): Promise<ApplyMinibarCheckResult> {
  const { tenantId, stayCheckinId, roomId, source } = args;

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { stockedRoomEnabled: true, stockedRoomPosLocationId: true, allowNegativeStock: true },
  });
  if (!tenant?.stockedRoomEnabled) {
    return { skipped: true, reason: "disabled", totalSold: 0, soldLines: [] };
  }

  const room = await tx.room.findFirst({
    where: { id: roomId, tenantId },
    select: { id: true, categoryId: true },
  });
  if (!room) {
    return { skipped: true, reason: "no-kit", totalSold: 0, soldLines: [] };
  }

  const kit = await tx.stockedRoomKitItem.findMany({
    where: { tenantId, roomCategoryId: room.categoryId },
    select: {
      productId: true,
      parQuantity: true,
      product: { select: { name: true, salePrice: true } },
    },
  });
  if (kit.length === 0) {
    return { skipped: true, reason: "no-kit", totalSold: 0, soldLines: [] };
  }

  const foundByProduct = new Map<string, number>();
  for (const f of args.found || []) {
    if (f && typeof f.productId === "string") {
      foundByProduct.set(f.productId, Math.max(0, Math.trunc(Number(f.foundQty) || 0)));
    }
  }

  const posLocationId = tenant.stockedRoomPosLocationId || null;
  const performedById = args.performedById || null;
  const performedByName = args.performedByName || null;

  // Estorna a conferência de check-out anterior desta hospedagem (se houver) — ver comentário do
  // cabeçalho. Devolve o estoque e desconta do total de consumo cada lançamento que ela gerou.
  if (source === "CHECKOUT") {
    const prior = await tx.roomMinibarCheck.findMany({
      where: { tenantId, stayCheckinId, source: "CHECKOUT" },
      select: { id: true, items: { select: { stayConsumptionId: true } } },
    });
    for (const pc of prior) {
      for (const it of pc.items) {
        if (!it.stayConsumptionId) continue;
        const cons = await tx.stayConsumption.findUnique({
          where: { id: it.stayConsumptionId },
          select: { id: true, productId: true, posLocationId: true, quantity: true, totalPrice: true },
        });
        if (!cons) continue;
        if (cons.productId && cons.posLocationId) {
          await tx.pOSProductStock.upsert({
            where: { productId_posLocationId: { productId: cons.productId, posLocationId: cons.posLocationId } },
            update: { currentStock: { increment: Number(cons.quantity) } },
            create: { productId: cons.productId, posLocationId: cons.posLocationId, currentStock: Number(cons.quantity) },
          });
        }
        await tx.stayCheckin.update({
          where: { id: stayCheckinId },
          data: { totalConsumption: { decrement: cons.totalPrice } },
        });
        await tx.stayConsumption.delete({ where: { id: cons.id } });
      }
      await tx.roomMinibarCheckItem.deleteMany({ where: { checkId: pc.id } });
      await tx.roomMinibarCheck.delete({ where: { id: pc.id } });
    }
  }

  const check = await tx.roomMinibarCheck.create({
    data: {
      tenantId,
      roomId,
      stayCheckinId,
      housekeepingTaskId: args.housekeepingTaskId || null,
      source,
      performedByType: args.performedByType,
      performedById,
      performedByName,
      totalSold: 0,
    },
    select: { id: true },
  });

  let totalSold = 0;
  let totalConsumptionIncrement = 0;
  const soldLines: ApplyMinibarCheckResult["soldLines"] = [];

  for (const item of kit) {
    const par = item.parQuantity;
    const foundRaw = foundByProduct.has(item.productId) ? (foundByProduct.get(item.productId) as number) : par;
    const found = Math.min(par, Math.max(0, foundRaw));
    const sold = par - found;
    const unitPrice = Number(item.product.salePrice);
    const totalPrice = Math.round(sold * unitPrice * 100) / 100;

    let stayConsumptionId: string | null = null;

    if (sold > 0) {
      if (posLocationId) {
        const posStock = await tx.pOSProductStock.findUnique({
          where: { productId_posLocationId: { productId: item.productId, posLocationId } },
        });
        const available = posStock?.currentStock ?? 0;
        if (available < sold && !tenant.allowNegativeStock) {
          throw new Error(
            `Estoque insuficiente de "${item.product.name}" no PDV do frigobar (disponível: ${available}, conferência aponta ${sold} vendido(s)).`
          );
        }
        await tx.pOSProductStock.upsert({
          where: { productId_posLocationId: { productId: item.productId, posLocationId } },
          update: { currentStock: { decrement: sold } },
          create: { productId: item.productId, posLocationId, currentStock: -sold },
        });
      }

      const consumption = await tx.stayConsumption.create({
        data: {
          stayCheckinId,
          productId: item.productId,
          productName: item.product.name,
          quantity: sold,
          unitPrice,
          totalPrice,
          posLocationId,
          operatorId: performedById,
          operatorName: performedByName,
        },
        select: { id: true },
      });
      stayConsumptionId = consumption.id;
      totalConsumptionIncrement += totalPrice;
      totalSold += totalPrice;
      soldLines.push({ productName: item.product.name, soldQty: sold, totalPrice });
    }

    await tx.roomMinibarCheckItem.create({
      data: {
        checkId: check.id,
        productId: item.productId,
        productName: item.product.name,
        parQuantity: par,
        foundQuantity: found,
        soldQuantity: sold,
        unitPrice,
        totalPrice,
        stayConsumptionId,
      },
    });
  }

  await tx.roomMinibarCheck.update({ where: { id: check.id }, data: { totalSold } });

  let newTotalConsumption: number | undefined;
  if (totalConsumptionIncrement > 0) {
    const updatedStay = await tx.stayCheckin.update({
      where: { id: stayCheckinId },
      data: { totalConsumption: { increment: totalConsumptionIncrement } },
      select: { totalConsumption: true },
    });
    newTotalConsumption = Number(updatedStay.totalConsumption);
  }

  return { skipped: false, checkId: check.id, totalSold, soldLines, newTotalConsumption };
}
