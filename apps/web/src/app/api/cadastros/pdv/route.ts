import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const salesPoints = await prisma.salesPoint.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, salesPoints });
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
    const { nome, codigo, localizacao, operador, status } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do ponto de venda é obrigatório." }, { status: 400 });
    }

    const salesPoint = await prisma.salesPoint.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        code: codigo || null,
        location: localizacao || null,
        operator: operador || null,
        active: status !== "INATIVO",
      },
    });

    return NextResponse.json({ success: true, salesPoint }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/pdv] Erro ao criar ponto de venda:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nome, codigo, localizacao, operador, status } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do ponto de venda é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do ponto de venda é obrigatório." }, { status: 400 });
    }

    const updated = await prisma.salesPoint.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(nome).trim(),
        code: codigo || null,
        location: localizacao || null,
        operator: operador || null,
        active: status !== "INATIVO",
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Ponto de venda não encontrado." }, { status: 404 });
    }
    const salesPoint = await prisma.salesPoint.findUnique({ where: { id } });

    return NextResponse.json({ success: true, salesPoint });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/pdv] Erro ao atualizar ponto de venda:", error);
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
      return NextResponse.json({ success: false, error: "ID do ponto de venda é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.salesPoint.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Ponto de venda não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Ponto de venda excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/pdv] Erro ao excluir ponto de venda:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
