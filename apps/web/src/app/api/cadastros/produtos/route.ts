import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro e manutenção de Produtos (industrializados / itens de estoque e frigobar).
// Classificação SEMPRE por lista cadastrada: groupId (obrigatório) e productTypeId (opcional).
// O estoque por PDV (POSProductStock) e os códigos de barras extras (ProductBarcode) têm rotas
// próprias (/api/stock, /api/stock/barcodes) — aqui é só o cadastro do produto.

const LIST_SELECT = {
  id: true,
  reference: true,
  name: true,
  barcode: true,
  unit: true,
  brand: true,
  costPrice: true,
  salePrice: true,
  generalStock: true,
  minStock: true,
  maxStock: true,
  group: { select: { id: true, name: true } },
  productType: { select: { id: true, name: true } },
  fiscalProfile: { select: { id: true, name: true } },
} as const;

type RawProduct = {
  id: string;
  reference: string | null;
  name: string;
  barcode: string | null;
  unit: string | null;
  brand: string | null;
  costPrice: any;
  salePrice: any;
  generalStock: number;
  minStock: number;
  maxStock: number | null;
  group: { id: string; name: string } | null;
  productType: { id: string; name: string } | null;
  fiscalProfile: { id: string; name: string } | null;
};

function serialize(p: RawProduct) {
  return {
    id: p.id,
    referencia: p.reference,
    nome: p.name,
    codigoBarras: p.barcode,
    unidade: p.unit,
    marca: p.brand,
    precoCusto: Number(p.costPrice),
    precoVenda: Number(p.salePrice),
    estoqueGeral: p.generalStock,
    estoqueMinimo: p.minStock,
    estoqueMaximo: p.maxStock,
    grupo: p.group,
    tipo: p.productType,
    perfilFiscal: p.fiscalProfile,
  };
}

// Resolve e valida um id relacionado contra o tenant. Retorna undefined se o campo não veio,
// null se veio vazio (limpar), ou o id validado. Lança se veio um id que não é do tenant.
async function resolveRef(
  model: "productGroup" | "productType" | "fiscalProfile",
  raw: unknown,
  tenantId: string
): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  const id = raw ? String(raw) : "";
  if (!id) return null;
  const found = await (prisma[model] as any).findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!found) throw new Error("Classificação ou perfil fiscal inválido para este hotel.");
  return id;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ name: "asc" }],
      select: LIST_SELECT,
    });

    return NextResponse.json({ success: true, products: products.map(serialize) });
  } catch (error: any) {
    console.error("[GET /api/cadastros/produtos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const nome = String(body.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ success: false, error: "O nome do produto é obrigatório." }, { status: 400 });
    }

    const groupId = await resolveRef("productGroup", body.grupoId, tenantId);
    if (!groupId) {
      return NextResponse.json({ success: false, error: "Selecione o grupo do produto." }, { status: 400 });
    }
    const productTypeId = await resolveRef("productType", body.tipoId, tenantId);
    const fiscalProfileId = await resolveRef("fiscalProfile", body.perfilFiscalId, tenantId);

    // Nome do grupo copiado para a coluna legada `category` enquanto telas antigas ainda a leem.
    const group = await prisma.productGroup.findFirst({ where: { id: groupId, tenantId }, select: { name: true } });

    const product = await prisma.product.create({
      data: {
        tenantId,
        name: nome,
        reference: body.referencia ? String(body.referencia).trim() : null,
        barcode: body.codigoBarras ? String(body.codigoBarras).trim() : null,
        unit: body.unidade ? String(body.unidade).trim().toUpperCase().slice(0, 6) : "UN",
        brand: body.marca ? String(body.marca).trim() : null,
        groupId,
        productTypeId: productTypeId ?? null,
        fiscalProfileId: fiscalProfileId ?? null,
        category: group?.name ?? null,
        costPrice: Math.max(0, Number(body.precoCusto) || 0),
        salePrice: Math.max(0, Number(body.precoVenda) || 0),
        minStock: Math.max(0, Math.trunc(Number(body.estoqueMinimo) || 0)),
        maxStock: body.estoqueMaximo ? Math.max(0, Math.trunc(Number(body.estoqueMaximo))) : null,
      },
      select: LIST_SELECT,
    });

    return NextResponse.json({ success: true, product: serialize(product) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/produtos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const id = String(body.id || "");
    const nome = String(body.nome || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "ID do produto é obrigatório." }, { status: 400 });
    if (!nome) return NextResponse.json({ success: false, error: "O nome do produto é obrigatório." }, { status: 400 });

    const groupId = await resolveRef("productGroup", body.grupoId, tenantId);
    if (groupId === null) {
      return NextResponse.json({ success: false, error: "Selecione o grupo do produto." }, { status: 400 });
    }
    const productTypeId = await resolveRef("productType", body.tipoId, tenantId);
    const fiscalProfileId = await resolveRef("fiscalProfile", body.perfilFiscalId, tenantId);

    const data: Record<string, unknown> = {
      name: nome,
      reference: body.referencia !== undefined ? (body.referencia ? String(body.referencia).trim() : null) : undefined,
      barcode: body.codigoBarras !== undefined ? (body.codigoBarras ? String(body.codigoBarras).trim() : null) : undefined,
      unit: body.unidade !== undefined ? (body.unidade ? String(body.unidade).trim().toUpperCase().slice(0, 6) : "UN") : undefined,
      brand: body.marca !== undefined ? (body.marca ? String(body.marca).trim() : null) : undefined,
      costPrice: body.precoCusto !== undefined ? Math.max(0, Number(body.precoCusto) || 0) : undefined,
      salePrice: body.precoVenda !== undefined ? Math.max(0, Number(body.precoVenda) || 0) : undefined,
      minStock: body.estoqueMinimo !== undefined ? Math.max(0, Math.trunc(Number(body.estoqueMinimo) || 0)) : undefined,
      maxStock:
        body.estoqueMaximo !== undefined
          ? body.estoqueMaximo
            ? Math.max(0, Math.trunc(Number(body.estoqueMaximo)))
            : null
          : undefined,
      productTypeId: productTypeId === undefined ? undefined : productTypeId,
      fiscalProfileId: fiscalProfileId === undefined ? undefined : fiscalProfileId,
    };
    if (groupId) {
      const group = await prisma.productGroup.findFirst({ where: { id: groupId, tenantId }, select: { name: true } });
      data.groupId = groupId;
      data.category = group?.name ?? null;
    }

    const updated = await prisma.product.updateMany({ where: { id, tenantId }, data });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }
    const product = await prisma.product.findFirst({ where: { id, tenantId }, select: LIST_SELECT });

    return NextResponse.json({ success: true, product: product ? serialize(product) : null });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/produtos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID do produto é obrigatório." }, { status: 400 });

    const existing = await prisma.product.findFirst({
      where: { id, tenantId },
      select: { _count: { select: { consumptions: true, comandaItems: true, transfers: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Produto não encontrado." }, { status: 404 });
    }
    const histRefs = existing._count.consumptions + existing._count.comandaItems + existing._count.transfers;
    if (histRefs > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este produto já tem movimento (consumo, comanda ou transferência) e não pode ser excluído. Você pode zerar o estoque e parar de usá-lo.",
        },
        { status: 409 }
      );
    }

    // POSProductStock e ProductBarcode têm onDelete: Cascade — somem junto.
    await prisma.product.deleteMany({ where: { id, tenantId } });
    return NextResponse.json({ success: true, message: "Produto excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/produtos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
