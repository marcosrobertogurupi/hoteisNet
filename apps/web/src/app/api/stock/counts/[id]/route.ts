import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/stock/counts/[id] — visão de confronto de uma contagem: cada produto com o que o
// funcionário contou × o saldo ATUAL do sistema (ao vivo, não um retrato do fim da contagem) e a
// diferença. Inclui também os produtos do alvo que NÃO foram lidos (candidatos a zerar) e, à
// parte, os códigos lidos que não existem no cadastro. `select` enxuto — regras de egress.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;
    const { id } = await params;

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        posLocationId: true,
        status: true,
        startedByName: true,
        note: true,
        finishedAt: true,
        reconciledAt: true,
        reconciledByName: true,
        posLocation: { select: { name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            barcodeRead: true,
            productNameSnapshot: true,
            countedQty: true,
            notFound: true,
            notes: true,
            systemQtySnapshot: true,
            adjustedTo: true,
            appliedAt: true,
          },
        },
      },
    });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }

    const isGeneral = count.posLocationId === null;
    const countedById = new Map(count.items.filter((i) => i.productId).map((i) => [i.productId as string, i]));

    // Saldo ATUAL do sistema para os produtos relevantes ao alvo.
    // - PDV: os produtos que têm saldo alocado naquele PDV (POSProductStock) + os contados.
    // - Geral: os produtos com saldo geral != 0 + os contados.
    const countedIds = [...countedById.keys()];

    let systemRows: { id: string; name: string; barcode: string | null; sistema: number }[];
    if (isGeneral) {
      const products = await prisma.product.findMany({
        where: {
          tenantId,
          OR: [{ generalStock: { not: 0 } }, ...(countedIds.length ? [{ id: { in: countedIds } }] : [])],
        },
        select: { id: true, name: true, barcode: true, generalStock: true },
      });
      systemRows = products.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, sistema: p.generalStock }));
    } else {
      const posId = count.posLocationId as string;
      const stocks = await prisma.pOSProductStock.findMany({
        where: {
          posLocationId: posId,
          OR: [{ currentStock: { not: 0 } }, ...(countedIds.length ? [{ productId: { in: countedIds } }] : [])],
        },
        select: { productId: true, currentStock: true, product: { select: { name: true, barcode: true } } },
      });
      systemRows = stocks.map((s) => ({
        id: s.productId,
        name: s.product.name,
        barcode: s.product.barcode,
        sistema: s.currentStock,
      }));
      // Contados que nem têm linha de saldo nesse PDV → saldo 0.
      const known = new Set(systemRows.map((r) => r.id));
      for (const it of count.items) {
        if (it.productId && !known.has(it.productId)) {
          systemRows.push({ id: it.productId, name: it.productNameSnapshot || "—", barcode: it.barcodeRead, sistema: 0 });
        }
      }
    }

    const rows = systemRows
      .map((r) => {
        const item = countedById.get(r.id);
        const contado = item?.countedQty ?? 0;
        const contadoNaContagem = !!item;
        return {
          productId: r.id,
          itemId: item?.id ?? null,
          nome: r.name,
          codigoBarras: r.barcode,
          sistema: r.sistema,
          contado,
          contadoNaContagem,
          diferenca: contado - r.sistema,
          aplicado: item?.appliedAt
            ? { de: item.systemQtySnapshot ?? null, para: item.adjustedTo ?? null, em: item.appliedAt }
            : null,
        };
      })
      .sort((a, b) => {
        // Com diferença primeiro, depois não contados, depois OK; dentro do grupo por nome.
        const rank = (x: typeof a) => (x.aplicado ? 3 : x.diferenca !== 0 ? 0 : !x.contadoNaContagem ? 1 : 2);
        return rank(a) - rank(b) || a.nome.localeCompare(b.nome);
      });

    const semCadastro = count.items
      .filter((i) => i.notFound)
      .map((i) => ({
        id: i.id,
        codigoBarras: i.barcodeRead,
        nome: i.productNameSnapshot,
        contado: i.countedQty,
        observacao: i.notes,
      }));

    return NextResponse.json({
      success: true,
      count: {
        id: count.id,
        alvo: count.posLocation?.name ?? "Estoque geral / almoxarifado",
        isGeneral,
        status: count.status,
        conferente: count.startedByName,
        observacao: count.note,
        finalizadaEm: count.finishedAt,
        confrontadaEm: count.reconciledAt,
        confrontadaPor: count.reconciledByName,
      },
      rows,
      semCadastro,
      resumo: {
        itensRelacionados: rows.length,
        comDiferenca: rows.filter((r) => r.diferenca !== 0 && !r.aplicado).length,
        semCadastro: semCadastro.length,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/stock/counts/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}
