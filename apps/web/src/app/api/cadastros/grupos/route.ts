import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro de Grupos (ProductGroup) — classificação principal de produtos, pratos e serviços.
// É lista cadastrada, nunca texto livre: as telas de Produtos e Pratos escolhem daqui.

const SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  active: true,
  _count: { select: { products: true, dishes: true } },
} as const;

type RawGroup = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  active: boolean;
  _count: { products: number; dishes: number };
};

function serialize(g: RawGroup) {
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    type: g.type,
    active: g.active,
    emUso: g._count.products + g._count.dishes,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // opcional: PRODUTO | PRATO | SERVICO
    const onlyActive = searchParams.get("active") === "1";

    const groups = await prisma.productGroup.findMany({
      where: {
        tenantId: session.tenantId,
        ...(type ? { type } : {}),
        ...(onlyActive ? { active: true } : {}),
      },
      orderBy: { name: "asc" },
      select: SELECT,
    });

    return NextResponse.json({ success: true, groups: groups.map(serialize) });
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
      return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });
    }

    const group = await prisma.productGroup.create({
      data: {
        tenantId: session!.tenantId!,
        name: nome,
        code: body.codigo ? String(body.codigo).trim() : null,
        type: body.tipo || "PRODUTO",
        active: body.active === undefined ? true : !!body.active,
      },
      select: SELECT,
    });

    return NextResponse.json({ success: true, group: serialize(group) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/grupos] Erro:", error);
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
    if (!id) return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });
    if (!nome) return NextResponse.json({ success: false, error: "O nome do grupo é obrigatório." }, { status: 400 });

    const updated = await prisma.productGroup.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: nome,
        code: body.codigo ? String(body.codigo).trim() : null,
        type: body.tipo || "PRODUTO",
        ...(body.active === undefined ? {} : { active: !!body.active }),
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Grupo não encontrado." }, { status: 404 });
    }

    // Propaga o novo nome para a coluna legada `Product.category` dos produtos deste grupo,
    // para que ela não fique defasada enquanto ainda existir código que a lê.
    await prisma.product.updateMany({ where: { groupId: id, tenantId: session!.tenantId! }, data: { category: nome } });
    const group = await prisma.productGroup.findFirst({ where: { id, tenantId: session!.tenantId! }, select: SELECT });

    return NextResponse.json({ success: true, group: group ? serialize(group) : null });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/grupos] Erro:", error);
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
    if (!id) return NextResponse.json({ success: false, error: "ID do grupo é obrigatório." }, { status: 400 });

    // Não exclui grupo em uso — o vínculo do produto/prato ficaria órfão e a tela perderia a
    // classificação. O usuário deve reclassificar antes, ou apenas inativar o grupo.
    const existing = await prisma.productGroup.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: { _count: { select: { products: true, dishes: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Grupo não encontrado." }, { status: 404 });
    }
    const emUso = existing._count.products + existing._count.dishes;
    if (emUso > 0) {
      return NextResponse.json(
        { success: false, error: `Este grupo está em uso por ${emUso} item(ns). Reclassifique-os ou inative o grupo.` },
        { status: 409 }
      );
    }

    await prisma.productGroup.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    return NextResponse.json({ success: true, message: "Grupo excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/grupos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
