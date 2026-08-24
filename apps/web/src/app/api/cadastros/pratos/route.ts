import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const dishes = await prisma.dish.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, dishes });
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
    const { nome, codigo, categoria, preco, descricao } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do prato é obrigatório." }, { status: 400 });
    }
    const priceNum = Number(preco);
    if (isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ success: false, error: "Informe um preço válido." }, { status: 400 });
    }

    const dish = await prisma.dish.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        code: codigo || null,
        category: categoria || null,
        price: priceNum,
        description: descricao || null,
      },
    });

    return NextResponse.json({ success: true, dish }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/pratos] Erro ao criar prato:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nome, codigo, categoria, preco, descricao } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do prato é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do prato é obrigatório." }, { status: 400 });
    }
    const priceNum = Number(preco);
    if (isNaN(priceNum) || priceNum < 0) {
      return NextResponse.json({ success: false, error: "Informe um preço válido." }, { status: 400 });
    }

    const updated = await prisma.dish.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(nome).trim(),
        code: codigo || null,
        category: categoria || null,
        price: priceNum,
        description: descricao || null,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Prato não encontrado." }, { status: 404 });
    }
    const dish = await prisma.dish.findUnique({ where: { id } });

    return NextResponse.json({ success: true, dish });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/pratos] Erro ao atualizar prato:", error);
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
      return NextResponse.json({ success: false, error: "ID do prato é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.dish.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Prato não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Prato excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/pratos] Erro ao excluir prato:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
