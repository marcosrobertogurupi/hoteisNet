import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const groups = await prisma.productGroup.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, groups });
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
    const { nome, codigo, tipo } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });
    }

    const group = await prisma.productGroup.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        code: codigo || null,
        type: tipo || "PRODUTO",
      },
    });

    return NextResponse.json({ success: true, group }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/grupos] Erro ao criar grupo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nome, codigo, tipo } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });
    }

    const updated = await prisma.productGroup.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(nome).trim(),
        code: codigo || null,
        type: tipo || "PRODUTO",
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Grupo não encontrado." }, { status: 404 });
    }
    const group = await prisma.productGroup.findUnique({ where: { id } });

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/grupos] Erro ao atualizar grupo:", error);
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
      return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.productGroup.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Grupo não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Grupo excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/grupos] Erro ao excluir grupo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
