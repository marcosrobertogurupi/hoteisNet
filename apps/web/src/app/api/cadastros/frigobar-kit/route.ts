import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Kit do "quarto abastecido" (frigobar): pré-cadastro de produtos + quantidade padrão por
// categoria de apartamento. Alimenta a conferência do frigobar na arrumação com hóspede (app da
// governanta) e no check-out (recepção). Só tem efeito com Tenant.stockedRoomEnabled = true.
//
// Segurança (ver CLAUDE.md): getSessionUser + session.tenantId em tudo; requireAdmin nas escritas
// (cadastro mestre); roomCategoryId/productId recebidos do cliente são sempre revalidados contra o
// tenant antes do uso; escrita com updateMany/deleteMany filtrando por tenant.

const ITEM_SELECT = {
  id: true,
  roomCategoryId: true,
  productId: true,
  parQuantity: true,
  product: { select: { id: true, name: true, salePrice: true, unit: true, reference: true } },
} as const;

function mapItem(i: {
  id: string;
  roomCategoryId: string;
  productId: string;
  parQuantity: number;
  product: { id: string; name: string; salePrice: any; unit: string | null; reference: string | null };
}) {
  return {
    id: i.id,
    roomCategoryId: i.roomCategoryId,
    productId: i.productId,
    parQuantity: i.parQuantity,
    productName: i.product.name,
    unitPrice: Number(i.product.salePrice),
    unit: i.product.unit,
    reference: i.product.reference,
  };
}

// GET /api/cadastros/frigobar-kit
//   ?roomCategoryId=<id>  → itens do kit daquela categoria
//   sem parâmetro         → visão geral: categorias do tenant + nº de itens/total de peças do kit
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;
    const roomCategoryId = new URL(req.url).searchParams.get("roomCategoryId");

    if (roomCategoryId) {
      const category = await prisma.roomCategory.findFirst({
        where: { id: roomCategoryId, tenantId },
        select: { id: true, name: true },
      });
      if (!category) {
        return NextResponse.json({ success: false, error: "Categoria não encontrada." }, { status: 404 });
      }
      const items = await prisma.stockedRoomKitItem.findMany({
        where: { tenantId, roomCategoryId },
        orderBy: { product: { name: "asc" } },
        select: ITEM_SELECT,
      });
      return NextResponse.json({ success: true, category, items: items.map(mapItem) });
    }

    const [categories, grouped] = await Promise.all([
      prisma.roomCategory.findMany({
        where: { tenantId, kind: "LODGING" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.stockedRoomKitItem.groupBy({
        by: ["roomCategoryId"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { parQuantity: true },
      }),
    ]);
    const byCategory = new Map(grouped.map((g) => [g.roomCategoryId, g]));

    return NextResponse.json({
      success: true,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        itemCount: byCategory.get(c.id)?._count._all ?? 0,
        totalPieces: Number(byCategory.get(c.id)?._sum.parQuantity ?? 0),
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/cadastros/frigobar-kit] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar o kit do frigobar." }, { status: 500 });
  }
}

// POST /api/cadastros/frigobar-kit — adiciona um produto ao kit de uma categoria.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const roomCategoryId = String(body.roomCategoryId || "");
    const productId = String(body.productId || "");
    const parQuantity = Math.trunc(Number(body.parQuantity));

    if (!roomCategoryId || !productId) {
      return NextResponse.json({ success: false, error: "Categoria e produto são obrigatórios." }, { status: 400 });
    }
    if (!Number.isFinite(parQuantity) || parQuantity < 1 || parQuantity > 999) {
      return NextResponse.json({ success: false, error: "Quantidade do kit deve ser entre 1 e 999." }, { status: 400 });
    }

    const [category, product] = await Promise.all([
      prisma.roomCategory.findFirst({ where: { id: roomCategoryId, tenantId }, select: { id: true } }),
      prisma.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } }),
    ]);
    if (!category) return NextResponse.json({ success: false, error: "Categoria não encontrada." }, { status: 404 });
    if (!product) return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });

    const existing = await prisma.stockedRoomKitItem.findFirst({
      where: { tenantId, roomCategoryId, productId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Este produto já está no kit desta categoria." }, { status: 409 });
    }

    const item = await prisma.stockedRoomKitItem.create({
      data: { tenantId, roomCategoryId, productId, parQuantity },
      select: ITEM_SELECT,
    });
    return NextResponse.json({ success: true, item: mapItem(item) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/frigobar-kit] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao adicionar item ao kit." }, { status: 500 });
  }
}

// PUT /api/cadastros/frigobar-kit — altera a quantidade padrão de um item do kit.
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const id = String(body.id || "");
    const parQuantity = Math.trunc(Number(body.parQuantity));

    if (!id) return NextResponse.json({ success: false, error: "ID do item é obrigatório." }, { status: 400 });
    if (!Number.isFinite(parQuantity) || parQuantity < 1 || parQuantity > 999) {
      return NextResponse.json({ success: false, error: "Quantidade do kit deve ser entre 1 e 999." }, { status: 400 });
    }

    const updated = await prisma.stockedRoomKitItem.updateMany({
      where: { id, tenantId },
      data: { parQuantity },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Item do kit não encontrado." }, { status: 404 });
    }
    const item = await prisma.stockedRoomKitItem.findFirst({ where: { id, tenantId }, select: ITEM_SELECT });
    return NextResponse.json({ success: true, item: item ? mapItem(item) : null });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/frigobar-kit] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar item do kit." }, { status: 500 });
  }
}

// DELETE /api/cadastros/frigobar-kit?id=... — remove um produto do kit.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID do item é obrigatório." }, { status: 400 });

    const deleted = await prisma.stockedRoomKitItem.deleteMany({ where: { id, tenantId } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Item do kit não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/frigobar-kit] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover item do kit." }, { status: 500 });
  }
}
