import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser } from "@/lib/auth";

// POST /api/stock/transfer — transfere unidades do Estoque Geral (Almoxarifado Central) de um
// produto para o estoque fracionado de um PDV (Frigobar, Restaurante, Bar Recepção etc.), para
// que o PDV tenha saldo disponível a ser baixado no Lançamento de Consumo do Quarto.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { productId, posLocationId, quantity, transferredBy } = body;

    const qty = Number(quantity) || 0;
    if (!productId || !posLocationId || qty <= 0) {
      return NextResponse.json(
        { success: false, error: "Produto, PDV de destino e quantidade são obrigatórios." },
        { status: 400 }
      );
    }

    const result = await txWithRetry(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId: session.tenantId! } });
      if (!product) throw new Error("Produto não encontrado.");
      const posLocation = await tx.pOSLocation.findFirst({ where: { id: posLocationId, tenantId: session.tenantId! } });
      if (!posLocation) throw new Error("PDV de destino não encontrado.");
      if (product.generalStock < qty) {
        throw new Error(`Estoque geral insuficiente (disponível: ${product.generalStock}).`);
      }

      await tx.product.update({ where: { id: productId }, data: { generalStock: { decrement: qty } } });

      const posStock = await tx.pOSProductStock.upsert({
        where: { productId_posLocationId: { productId, posLocationId } },
        update: { currentStock: { increment: qty } },
        create: { productId, posLocationId, currentStock: qty },
      });

      await tx.stockTransfer.create({
        data: { productId, toPosLocationId: posLocationId, quantity: qty, transferredBy: transferredBy || "SISTEMA" },
      });

      return posStock;
    });

    return NextResponse.json({ success: true, currentStock: result.currentStock });
  } catch (error: any) {
    console.error("[POST /api/stock/transfer] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao transferir estoque." }, { status: 500 });
  }
}
