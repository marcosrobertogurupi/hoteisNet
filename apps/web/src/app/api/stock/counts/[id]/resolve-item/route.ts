import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

// POST /api/stock/counts/[id]/resolve-item — o assinante (admin) resolve um item "código não
// encontrado no cadastro" da contagem, de dois jeitos:
//   { itemId, productId }            → vincula o código lido a um produto JÁ cadastrado
//   { itemId, novo: { nome, grupoId, ... } } → cria um produto novo já com esse código
// Em ambos os casos o código vira um ProductBarcode do produto (um produto pode ter vários
// códigos — ex.: "picolé de fruta" com N códigos), e a linha da contagem passa a apontar para
// o produto (somando na linha dele, se ele também foi contado normalmente).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const itemId = String(body.itemId || "");
    const productIdIn = body.productId ? String(body.productId) : "";
    const novo = body.novo && typeof body.novo === "object" ? body.novo : null;

    if (!itemId || (!productIdIn && !novo)) {
      return NextResponse.json(
        { success: false, error: "Informe o item e o produto (existente ou novo)." },
        { status: 400 }
      );
    }

    const count = await prisma.stockCount.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, posLocation: { select: { name: true } }, posLocationId: true },
    });
    if (!count) {
      return NextResponse.json({ success: false, error: "Contagem não encontrada." }, { status: 404 });
    }
    if (count.status !== "DONE") {
      return NextResponse.json(
        { success: false, error: "Só dá para resolver códigos numa contagem finalizada e ainda não confrontada." },
        { status: 409 }
      );
    }

    const item = await prisma.stockCountItem.findFirst({
      where: { id: itemId, countId: id },
      select: { id: true, barcodeRead: true, countedQty: true, notFound: true, productId: true },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Item não encontrado nesta contagem." }, { status: 404 });
    }
    if (!item.notFound || !item.barcodeRead) {
      return NextResponse.json({ success: false, error: "Este item não é um código sem cadastro." }, { status: 400 });
    }
    const code = item.barcodeRead;

    // Resolve o produto alvo: existente (valida tenant) ou cria um novo.
    let productId = productIdIn;
    let productName = "";
    if (productId) {
      const p = await prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, name: true } });
      if (!p) {
        return NextResponse.json({ success: false, error: "Produto não pertence a este hotel." }, { status: 400 });
      }
      productName = p.name;
    } else {
      const nome = String(novo.nome || "").trim();
      const grupoId = String(novo.grupoId || "");
      if (!nome) return NextResponse.json({ success: false, error: "Informe o nome do produto." }, { status: 400 });
      if (!grupoId) return NextResponse.json({ success: false, error: "Selecione o grupo do produto." }, { status: 400 });
      const group = await prisma.productGroup.findFirst({ where: { id: grupoId, tenantId }, select: { id: true, name: true } });
      if (!group) {
        return NextResponse.json({ success: false, error: "Grupo inválido para este hotel." }, { status: 400 });
      }
      const created = await prisma.product.create({
        data: {
          tenantId,
          name: nome,
          barcode: code,
          groupId: group.id,
          category: group.name,
          unit: novo.unidade ? String(novo.unidade).trim().toUpperCase().slice(0, 6) : "UN",
          costPrice: Math.max(0, Number(novo.precoCusto) || 0),
          salePrice: Math.max(0, Number(novo.precoVenda) || 0),
          minStock: Math.max(0, Math.trunc(Number(novo.estoqueMinimo) || 0)),
        },
        select: { id: true, name: true },
      });
      productId = created.id;
      productName = created.name;
    }

    // Código já vinculado a outro produto? (product_barcodes.code é único.)
    const existingLink = await prisma.productBarcode.findUnique({
      where: { code },
      select: { productId: true, product: { select: { name: true, tenantId: true } } },
    });
    if (existingLink && existingLink.productId !== productId) {
      // Se for de outro tenant, mensagem genérica; do mesmo tenant, diz qual produto.
      const msg =
        existingLink.product.tenantId === tenantId
          ? `Este código já está vinculado ao produto "${existingLink.product.name}".`
          : "Este código de barras já está em uso.";
      return NextResponse.json({ success: false, error: msg }, { status: 409 });
    }

    const result = await txWithRetry(async (tx) => {
      if (!existingLink) {
        await tx.productBarcode.create({ data: { productId, code } });
      }
      // Se o produto ainda não tem código "principal", usa esse (ajuda as listas a mostrarem o código).
      await tx.product.updateMany({
        where: { id: productId, tenantId, barcode: null },
        data: { barcode: code },
      });

      // Re-aponta a linha da contagem para o produto. Se o produto já tem uma linha nesta
      // contagem (foi contado normalmente), soma a quantidade nela e apaga a linha "sem cadastro".
      const sameProductItem = await tx.stockCountItem.findFirst({
        where: { countId: id, productId, id: { not: item.id } },
        select: { id: true, countedQty: true },
      });
      let merged = false;
      if (sameProductItem) {
        await tx.stockCountItem.update({
          where: { id: sameProductItem.id },
          data: { countedQty: sameProductItem.countedQty + item.countedQty, productNameSnapshot: productName },
        });
        await tx.stockCountItem.delete({ where: { id: item.id } });
        merged = true;
      } else {
        await tx.stockCountItem.update({
          where: { id: item.id },
          data: { productId, notFound: false, productNameSnapshot: productName, notes: null },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: session!.userId,
          userName: session!.name,
          action: "STOCK_COUNT_LINK_BARCODE",
          description: `Código ${code} vinculado ao produto "${productName}"${productIdIn ? "" : " (cadastrado agora)"} pela conferência de contagem.`,
          entityType: "Product",
          entityId: productId,
          terminal: getTerminalName(req),
          ipAddress: getClientIp(req),
          details: { countId: id, code, productId, novo: !productIdIn } as any,
        },
      });

      return { merged };
    });

    return NextResponse.json({ success: true, productId, productName, ...result });
  } catch (error: any) {
    console.error("[POST /api/stock/counts/[id]/resolve-item] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao resolver o código." }, { status: 500 });
  }
}
