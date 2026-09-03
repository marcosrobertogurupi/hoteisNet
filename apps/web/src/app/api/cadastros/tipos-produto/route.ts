import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro de Tipos de Produto (ProductType) — segunda classificação, independente do Grupo
// (Prod_TipoProd / TipoProduto no WinDev). Lista cadastrada, nunca texto livre.

const SELECT = {
  id: true,
  code: true,
  name: true,
  active: true,
  _count: { select: { products: true } },
} as const;

type RawType = {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  _count: { products: number };
};

function serialize(t: RawType) {
  return { id: t.id, code: t.code, name: t.name, active: t.active, emUso: t._count.products };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const onlyActive = new URL(req.url).searchParams.get("active") === "1";

    const types = await prisma.productType.findMany({
      where: { tenantId: session.tenantId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { name: "asc" },
      select: SELECT,
    });

    return NextResponse.json({ success: true, types: types.map(serialize) });
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
    const nome = String(body.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ success: false, error: "O nome do tipo é obrigatório." }, { status: 400 });
    }

    const type = await prisma.productType.create({
      data: {
        tenantId: session!.tenantId!,
        name: nome,
        code: body.codigo ? String(body.codigo).trim() : null,
        active: body.active === undefined ? true : !!body.active,
      },
      select: SELECT,
    });

    return NextResponse.json({ success: true, type: serialize(type) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/tipos-produto] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const id = String(body.id || "");
    const nome = String(body.nome || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "ID do tipo é obrigatório." }, { status: 400 });
    if (!nome) return NextResponse.json({ success: false, error: "O nome do tipo é obrigatório." }, { status: 400 });

    const updated = await prisma.productType.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: nome,
        code: body.codigo ? String(body.codigo).trim() : null,
        ...(body.active === undefined ? {} : { active: !!body.active }),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Tipo não encontrado." }, { status: 404 });
    }
    const type = await prisma.productType.findFirst({ where: { id, tenantId: session!.tenantId! }, select: SELECT });

    return NextResponse.json({ success: true, type: type ? serialize(type) : null });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/tipos-produto] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID do tipo é obrigatório." }, { status: 400 });

    const existing = await prisma.productType.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: { _count: { select: { products: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tipo não encontrado." }, { status: 404 });
    }
    if (existing._count.products > 0) {
      return NextResponse.json(
        { success: false, error: `Este tipo está em uso por ${existing._count.products} produto(s). Reclassifique-os ou inative o tipo.` },
        { status: 409 }
      );
    }

    await prisma.productType.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    return NextResponse.json({ success: true, message: "Tipo excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/tipos-produto] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
