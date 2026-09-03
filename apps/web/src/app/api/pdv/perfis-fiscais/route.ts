import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro de perfis tributários (FiscalProfile) reutilizados por pratos e produtos na emissão
// de NFC-e / NF-e. Para este hotel (Lucro Presumido / regime normal) preenche-se o bloco CST;
// os campos CSOSN existem para tenants futuros no Simples Nacional. Deve ser preenchido com
// orientação do contador.

const PROFILE_SELECT = {
  id: true,
  name: true,
  ncm: true,
  cfop: true,
  cest: true,
  origem: true,
  cstIcms: true,
  aliqIcms: true,
  redBaseIcms: true,
  csosn: true,
  cstPis: true,
  aliqPis: true,
  cstCofins: true,
  aliqCofins: true,
  active: true,
  _count: { select: { dishes: true, products: true } },
} as const;

function parseBody(body: any) {
  return {
    name: String(body.nome || "").trim(),
    ncm: String(body.ncm || "").replace(/\D/g, ""),
    cfop: String(body.cfop || "").replace(/\D/g, ""),
    cest: body.cest ? String(body.cest).replace(/\D/g, "") : null,
    origem: /^[0-8]$/.test(String(body.origem)) ? String(body.origem) : "0",
    cstIcms: body.cstIcms ? String(body.cstIcms).trim() : null,
    aliqIcms: Math.max(0, Number(body.aliqIcms) || 0),
    redBaseIcms: Math.max(0, Number(body.redBaseIcms) || 0),
    csosn: body.csosn ? String(body.csosn).trim() : null,
    cstPis: body.cstPis ? String(body.cstPis).trim() : "07",
    aliqPis: Math.max(0, Number(body.aliqPis) || 0),
    cstCofins: body.cstCofins ? String(body.cstCofins).trim() : "07",
    aliqCofins: Math.max(0, Number(body.aliqCofins) || 0),
    active: body.ativo !== false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const profiles = await prisma.fiscalProfile.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: PROFILE_SELECT,
    });

    return NextResponse.json({ success: true, perfis: profiles });
  } catch (error: any) {
    console.error("[GET /api/pdv/perfis-fiscais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const data = parseBody(await req.json());
    if (!data.name) {
      return NextResponse.json({ success: false, error: "Informe um nome para o perfil fiscal." }, { status: 400 });
    }
    if (data.ncm.length !== 8) {
      return NextResponse.json({ success: false, error: "O NCM deve ter 8 dígitos." }, { status: 400 });
    }
    if (data.cfop.length !== 4) {
      return NextResponse.json({ success: false, error: "O CFOP deve ter 4 dígitos." }, { status: 400 });
    }

    const perfil = await prisma.fiscalProfile.create({
      data: { tenantId: session!.tenantId!, ...data },
      select: PROFILE_SELECT,
    });

    return NextResponse.json({ success: true, perfil }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/pdv/perfis-fiscais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "ID do perfil fiscal é obrigatório." }, { status: 400 });
    }
    const data = parseBody(body);
    if (!data.name) {
      return NextResponse.json({ success: false, error: "Informe um nome para o perfil fiscal." }, { status: 400 });
    }
    if (data.ncm.length !== 8) {
      return NextResponse.json({ success: false, error: "O NCM deve ter 8 dígitos." }, { status: 400 });
    }
    if (data.cfop.length !== 4) {
      return NextResponse.json({ success: false, error: "O CFOP deve ter 4 dígitos." }, { status: 400 });
    }

    const updated = await prisma.fiscalProfile.updateMany({
      where: { id: body.id, tenantId: session!.tenantId! },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Perfil fiscal não encontrado." }, { status: 404 });
    }

    const perfil = await prisma.fiscalProfile.findFirst({
      where: { id: body.id, tenantId: session!.tenantId! },
      select: PROFILE_SELECT,
    });

    return NextResponse.json({ success: true, perfil });
  } catch (error: any) {
    console.error("[PUT /api/pdv/perfis-fiscais] Erro:", error);
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
      return NextResponse.json({ success: false, error: "ID do perfil fiscal é obrigatório." }, { status: 400 });
    }

    const inUse = await prisma.fiscalProfile.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: { _count: { select: { dishes: true, products: true } } },
    });
    if (!inUse) {
      return NextResponse.json({ success: false, error: "Perfil fiscal não encontrado." }, { status: 404 });
    }
    if (inUse._count.dishes > 0 || inUse._count.products > 0) {
      return NextResponse.json(
        { success: false, error: "Este perfil está em uso por itens do catálogo. Troque-os antes de excluir." },
        { status: 409 }
      );
    }

    await prisma.fiscalProfile.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    return NextResponse.json({ success: true, message: "Perfil fiscal excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/pdv/perfis-fiscais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
