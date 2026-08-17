import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/andares — lista os andares pré-cadastrados pelo assinante (tenant)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const floors = await prisma.floor.findMany({
      where: { tenantId: { in: tenantIdsToSearch } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, floors });
  } catch (error: any) {
    console.error("[GET /api/cadastros/andares] Erro ao buscar andares:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/andares — cria um novo andar no pré-cadastro do assinante
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, name } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "O nome do andar é obrigatório." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

    const existing = await prisma.floor.findFirst({
      where: { tenantId: effectiveTenantId, name: String(name).trim() },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Este andar já está cadastrado." }, { status: 409 });
    }

    const floor = await prisma.floor.create({
      data: { tenantId: effectiveTenantId, name: String(name).trim() },
    });

    return NextResponse.json({ success: true, floor }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/andares] Erro ao criar andar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/andares — atualiza um andar existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do andar é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ success: false, error: "O nome do andar é obrigatório." }, { status: 400 });
      }
      data.name = String(name).trim();
    }
    if (active !== undefined) data.active = active;

    const floor = await prisma.floor.update({ where: { id }, data });

    return NextResponse.json({ success: true, floor });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/andares] Erro ao atualizar andar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/andares?id=... — exclui um andar do pré-cadastro
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do andar é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.floor.deleteMany({ where: { id } });

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Andar não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Andar excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/andares] Erro ao excluir andar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
