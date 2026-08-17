import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/categorias-apartamento — lista as categorias de apartamento (UH)
// pré-cadastradas pelo assinante (tenant)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const categories = await prisma.roomCategory.findMany({
      where: { tenantId: { in: tenantIdsToSearch } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error("[GET /api/cadastros/categorias-apartamento] Erro ao buscar categorias:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/categorias-apartamento — cria uma nova categoria de apartamento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, name, dailyPrice, capacity, description } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "O nome da categoria é obrigatório." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

    const existing = await prisma.roomCategory.findFirst({
      where: { tenantId: effectiveTenantId, name: String(name).trim() },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Esta categoria já está cadastrada." }, { status: 409 });
    }

    const category = await prisma.roomCategory.create({
      data: {
        tenantId: effectiveTenantId,
        name: String(name).trim(),
        dailyPrice: dailyPrice ?? 0,
        capacity: capacity ?? 2,
        description: description || null,
      },
    });

    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/categorias-apartamento] Erro ao criar categoria:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/categorias-apartamento — atualiza uma categoria existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, dailyPrice, capacity, description, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da categoria é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ success: false, error: "O nome da categoria é obrigatório." }, { status: 400 });
      }
      data.name = String(name).trim();
    }
    if (dailyPrice !== undefined) data.dailyPrice = dailyPrice;
    if (capacity !== undefined) data.capacity = capacity;
    if (description !== undefined) data.description = description || null;
    if (active !== undefined) data.active = active;

    const category = await prisma.roomCategory.update({ where: { id }, data });

    return NextResponse.json({ success: true, category });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/categorias-apartamento] Erro ao atualizar categoria:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/categorias-apartamento?id=... — exclui uma categoria de apartamento
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da categoria é obrigatório." }, { status: 400 });
    }

    let deleted;
    try {
      deleted = await prisma.roomCategory.deleteMany({ where: { id } });
    } catch (dbErr: any) {
      if (dbErr?.code === "P2003") {
        return NextResponse.json(
          { success: false, error: "Não é possível excluir: existem apartamentos cadastrados nesta categoria." },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Categoria não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Categoria excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/categorias-apartamento] Erro ao excluir categoria:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
