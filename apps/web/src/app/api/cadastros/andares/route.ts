import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/cadastros/andares — lista os andares pré-cadastrados pelo tenant da sessão
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const floors = await prisma.floor.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, floors });
  } catch (error: any) {
    console.error("[GET /api/cadastros/andares] Erro ao buscar andares:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/andares — cria um novo andar no pré-cadastro do tenant da sessão
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { name } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "O nome do andar é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.floor.findFirst({
      where: { tenantId: session!.tenantId!, name: String(name).trim() },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Este andar já está cadastrado." }, { status: 409 });
    }

    const floor = await prisma.floor.create({
      data: { tenantId: session!.tenantId!, name: String(name).trim() },
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
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

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

    const updated = await prisma.floor.updateMany({ where: { id, tenantId: session!.tenantId! }, data });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Andar não encontrado." }, { status: 404 });
    }
    const floor = await prisma.floor.findUnique({ where: { id } });

    return NextResponse.json({ success: true, floor });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/andares] Erro ao atualizar andar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/andares?id=... — exclui um andar do pré-cadastro
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do andar é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.floor.deleteMany({ where: { id, tenantId: session!.tenantId! } });

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Andar não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Andar excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/andares] Erro ao excluir andar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
