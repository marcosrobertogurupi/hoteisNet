import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/stock/barcodes?productId=... — lista os códigos de barras vinculados a um produto.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ success: false, error: "productId é obrigatório." }, { status: 400 });
    }

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }

    const barcodes = await prisma.productBarcode.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, barcodes });
  } catch (error: any) {
    console.error("[GET /api/stock/barcodes] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar códigos de barras." }, { status: 500 });
  }
}

// POST /api/stock/barcodes — vincula um novo código de barras a um produto. Vários códigos podem
// apontar para o mesmo produto; cada código, porém, só pode estar vinculado a um único produto.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const productId = String(body.productId || "");
    const code = String(body.code || "").trim();

    if (!productId || !code) {
      return NextResponse.json({ success: false, error: "Produto e código de barras são obrigatórios." }, { status: 400 });
    }

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } });
    if (!product) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }

    const existing = await prisma.productBarcode.findUnique({ where: { code }, include: { product: true } });
    if (existing) {
      if (existing.productId === productId) {
        return NextResponse.json({ success: false, error: "Este código de barras já está vinculado a este produto." }, { status: 409 });
      }
      return NextResponse.json(
        { success: false, error: `Este código de barras já está vinculado ao produto "${existing.product.name}".` },
        { status: 409 }
      );
    }

    const barcode = await prisma.productBarcode.create({ data: { productId, code } });

    return NextResponse.json({ success: true, barcode });
  } catch (error: any) {
    console.error("[POST /api/stock/barcodes] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao vincular código de barras." }, { status: 500 });
  }
}

// DELETE /api/stock/barcodes — remove o vínculo de um código de barras com um produto.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body.id || "");

    if (!id) {
      return NextResponse.json({ success: false, error: "id é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.productBarcode.deleteMany({ where: { id, product: { tenantId: session.tenantId } } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Código de barras não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/stock/barcodes] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover código de barras." }, { status: 500 });
  }
}
