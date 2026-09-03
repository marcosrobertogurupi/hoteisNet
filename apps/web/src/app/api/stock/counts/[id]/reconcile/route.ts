import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

const MAX_ADJUSTMENTS = 300;

// POST /api/stock/counts/[id]/reconcile — o assinante (admin) confronta a contagem e aplica os
// ajustes de saldo escolhidos. Esta é a ÚNICA rota do módulo de contagem que grava saldo de
// estoque. Cada ajuste vira uma linha da contagem com o retrato do saldo anterior + o novo, e
// tudo é registrado em AuditLog. `finalize: true` encerra o confronto (status RECONCILED).
// Body: { adjustments: [{ productId, toQty }], finalize?: boolean }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const finalize = body.finalize === true;
    const rawAdjustments: unknown[] = Array.isArray(body.adjustments) ? body.adjustments : [];

    if (rawAdjustments.length > MAX_ADJUSTMENTS) {
      return NextResponse.json(
        { success: false, error: `Muitos ajustes de uma vez (máx. ${MAX_ADJUSTMENTS}).` },
        { status: 400 }
      );
    }

    // Normaliza e deduplica por productId (último ganha).
    const byProduct = new Map<string, number>();
    for (const a of rawAdjustments) {
      const productId = String((a as any)?.productId || "");
      const toQty = Math.trunc(Number((a as any)?.toQty));
      if (!productId || !Number.isFinite(toQty) || toQty < 0) {
        return NextResponse.json({ success: false, error: "Ajuste inválido (produto ou quantidade)." }, { status: 400 });
      }
      byProduct.set(productId, toQty);
    }

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId },
      select: { id: true, posLocationId: true, status: true, posLocation: { select: { name: true } } },
    });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status !== "DONE") {
      return NextResponse.json(
        {
          success: false,
          error:
            count.status === "RECONCILED"
              ? "Esta contagem já foi confrontada."
              : count.status === "OPEN"
                ? "A contagem ainda não foi finalizada pelo funcionário."
                : "Esta contagem foi cancelada.",
        },
        { status: 409 }
      );
    }

    const productIds = [...byProduct.keys()];
    if (productIds.length > 0) {
      const valid = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
        select: { id: true },
      });
      if (valid.length !== productIds.length) {
        return NextResponse.json({ success: false, error: "Um dos produtos não pertence a este hotel." }, { status: 400 });
      }
    }

    const isGeneral = count.posLocationId === null;
    const alvo = count.posLocation?.name ?? "Estoque geral / almoxarifado";
    const now = new Date();

    const applied = await txWithRetry(async (tx) => {
      const changes: { productId: string; nome: string; de: number; para: number }[] = [];

      for (const [productId, toQty] of byProduct) {
        let de = 0;
        let nome = "";
        if (isGeneral) {
          const p = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { generalStock: true, name: true } });
          de = p?.generalStock ?? 0;
          nome = p?.name ?? productId;
          await tx.product.updateMany({ where: { id: productId, tenantId }, data: { generalStock: toQty } });
        } else {
          const posLocationId = count.posLocationId as string;
          const existing = await tx.pOSProductStock.findUnique({
            where: { productId_posLocationId: { productId, posLocationId } },
            select: { currentStock: true },
          });
          de = existing?.currentStock ?? 0;
          const p = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { name: true } });
          nome = p?.name ?? productId;
          await tx.pOSProductStock.upsert({
            where: { productId_posLocationId: { productId, posLocationId } },
            update: { currentStock: toQty },
            create: { productId, posLocationId, currentStock: toQty },
          });
        }

        // Registra o ajuste na própria contagem (cria a linha se o produto não foi lido).
        const item = await tx.stockCountItem.findFirst({
          where: { countId: id, productId },
          select: { id: true },
        });
        if (item) {
          await tx.stockCountItem.update({
            where: { id: item.id },
            data: { systemQtySnapshot: de, adjustedTo: toQty, appliedAt: now },
          });
        } else {
          await tx.stockCountItem.create({
            data: {
              countId: id,
              productId,
              productNameSnapshot: nome,
              countedQty: 0,
              notFound: false,
              systemQtySnapshot: de,
              adjustedTo: toQty,
              appliedAt: now,
            },
          });
        }

        changes.push({ productId, nome, de, para: toQty });
      }

      if (changes.length > 0) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: session!.userId,
            userName: session!.name,
            action: "STOCK_COUNT_RECONCILE",
            description: `Ajuste de estoque por contagem (${alvo}): ${changes.length} produto(s).`,
            entityType: "StockCount",
            entityId: id,
            terminal: getTerminalName(req),
            ipAddress: getClientIp(req),
            details: { alvo, ajustes: changes.slice(0, 150) } as any,
          },
        });
      }

      if (finalize) {
        await tx.stockCount.updateMany({
          where: { id, tenantId, status: "DONE" },
          data: { status: "RECONCILED", reconciledAt: now, reconciledByName: session!.name },
        });
      }

      return changes;
    });

    return NextResponse.json({ success: true, applied: applied.length, finalized: finalize });
  } catch (error: any) {
    console.error("[POST /api/stock/counts/[id]/reconcile] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao aplicar os ajustes." }, { status: 500 });
  }
}
