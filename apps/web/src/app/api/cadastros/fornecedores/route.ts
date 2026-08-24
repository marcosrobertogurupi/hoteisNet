import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const suppliers = await prisma.supplier.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, suppliers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { razao, ...rest } = body;

    if (!razao || !String(razao).trim()) {
      return NextResponse.json({ success: false, error: "A razão social / nome é obrigatória." }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        tenantId: session!.tenantId!,
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
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, razao, ...rest } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do fornecedor é obrigatório." }, { status: 400 });
    }
    if (!razao || !String(razao).trim()) {
      return NextResponse.json({ success: false, error: "A razão social / nome é obrigatória." }, { status: 400 });
    }

    const updated = await prisma.supplier.updateMany({
      where: { id, tenantId: session!.tenantId! },
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
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Fornecedor não encontrado." }, { status: 404 });
    }
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    return NextResponse.json({ success: true, supplier });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/fornecedores] Erro ao atualizar fornecedor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do fornecedor é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.supplier.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Fornecedor não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Fornecedor excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/fornecedores] Erro ao excluir fornecedor:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
