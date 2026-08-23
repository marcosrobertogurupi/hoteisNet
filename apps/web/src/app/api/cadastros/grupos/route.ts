import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const groups = await prisma.productGroup.findMany({
      where: { tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, groups });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, nome, codigo, tipo } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });
    }

    const group = await prisma.productGroup.create({
      data: {
        tenantId: tenantId || DEFAULT_TENANT_ID,
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
    const body = await req.json();
    const { id, nome, codigo, tipo } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });
    }

    const group = await prisma.productGroup.update({
      where: { id },
      data: {
        name: String(nome).trim(),
        code: codigo || null,
        type: tipo || "PRODUTO",
      },
    });

    return NextResponse.json({ success: true, group });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/grupos] Erro ao atualizar grupo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.productGroup.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Grupo não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Grupo excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/grupos] Erro ao excluir grupo:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
