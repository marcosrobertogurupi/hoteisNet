import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, suppliers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, razao, ...rest } = body;

    if (!razao || !String(razao).trim()) {
      return NextResponse.json({ success: false, error: "A razão social / nome é obrigatória." }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        tenantId: tenantId || DEFAULT_TENANT_ID,
        name: String(razao).trim(),
        tradeName: rest.fantasia || null,
        cnpj: rest.cnpjCpf || null,
        ie: rest.ie || null,
        zipCode: rest.cep || null,
        address: rest.logradouro || null,
        number: rest.numero || null,
        neighborhood: rest.bairro || null,
        city: rest.cidade || null,
        state: rest.uf || null,
        phone: rest.telefone || null,
        email: rest.email || null,
        notes: rest.observacao || null,
      },
    });

    return NextResponse.json({ success: true, supplier }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/fornecedores] Erro ao criar fornecedor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, razao, ...rest } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do fornecedor é obrigatório." }, { status: 400 });
    }
    if (!razao || !String(razao).trim()) {
      return NextResponse.json({ success: false, error: "A razão social / nome é obrigatória." }, { status: 400 });
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: String(razao).trim(),
        tradeName: rest.fantasia || null,
        cnpj: rest.cnpjCpf || null,
        ie: rest.ie || null,
        zipCode: rest.cep || null,
        address: rest.logradouro || null,
        number: rest.numero || null,
        neighborhood: rest.bairro || null,
        city: rest.cidade || null,
        state: rest.uf || null,
        phone: rest.telefone || null,
        email: rest.email || null,
        notes: rest.observacao || null,
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/fornecedores] Erro ao atualizar fornecedor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do fornecedor é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.supplier.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Fornecedor não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Fornecedor excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/fornecedores] Erro ao excluir fornecedor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
