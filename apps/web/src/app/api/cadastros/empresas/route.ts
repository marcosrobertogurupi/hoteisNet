import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const companies = await prisma.company.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, companies });
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
      return NextResponse.json({ success: false, error: "A razão social é obrigatória." }, { status: 400 });
    }

    const company = await prisma.company.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(razao).trim(),
        tradeName: rest.fantasia || null,
        cnpj: rest.cnpj || "",
        ie: rest.ie || null,
        zipCode: rest.cep || null,
        address: rest.logradouro || null,
        number: rest.numero || null,
        complement: rest.complEnder || null,
        neighborhood: rest.bairro || null,
        city: rest.cidade || null,
        state: rest.uf || null,
        billingZipCode: rest.cepCobr || null,
        billingAddress: rest.logradouroCobr || null,
        billingNumber: rest.numeroCobr || null,
        billingComplement: rest.complEnderCobr || null,
        billingNeighborhood: rest.bairroCobr || null,
        billingCity: rest.cidadeCobr || null,
        billingState: rest.ufCobr || null,
        phones: rest.telefones || [],
        emails: rest.emails || [],
        notes: rest.observacao || null,
        phone: rest.telefones?.[0]?.telefone || null,
        email: rest.emails?.[0]?.email || null,
      },
    });

    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/empresas] Erro ao criar empresa:", error);
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
      return NextResponse.json({ success: false, error: "ID da empresa é obrigatório." }, { status: 400 });
    }
    if (!razao || !String(razao).trim()) {
      return NextResponse.json({ success: false, error: "A razão social é obrigatória." }, { status: 400 });
    }

    const updated = await prisma.company.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(razao).trim(),
        tradeName: rest.fantasia || null,
        cnpj: rest.cnpj || "",
        ie: rest.ie || null,
        zipCode: rest.cep || null,
        address: rest.logradouro || null,
        number: rest.numero || null,
        complement: rest.complEnder || null,
        neighborhood: rest.bairro || null,
        city: rest.cidade || null,
        state: rest.uf || null,
        billingZipCode: rest.cepCobr || null,
        billingAddress: rest.logradouroCobr || null,
        billingNumber: rest.numeroCobr || null,
        billingComplement: rest.complEnderCobr || null,
        billingNeighborhood: rest.bairroCobr || null,
        billingCity: rest.cidadeCobr || null,
        billingState: rest.ufCobr || null,
        phones: rest.telefones || [],
        emails: rest.emails || [],
        notes: rest.observacao || null,
        phone: rest.telefones?.[0]?.telefone || null,
        email: rest.emails?.[0]?.email || null,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Empresa não encontrada." }, { status: 404 });
    }
    const company = await prisma.company.findUnique({ where: { id } });

    return NextResponse.json({ success: true, company });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/empresas] Erro ao atualizar empresa:", error);
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
      return NextResponse.json({ success: false, error: "ID da empresa é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.company.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Empresa não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Empresa excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/empresas] Erro ao excluir empresa:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
