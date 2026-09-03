import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro único de Pontos de Venda (POSLocation). É a mesma lista consumida pelo popup
// "P.D.V." do Lançamento de Consumo do Quarto, pelas colunas do Estoque Multi-PDV e pelo PDV
// das comandas do restaurante. O antigo modelo SalesPoint foi unificado aqui.

// Pontos padrão criados na primeira leitura, espelhando o popup do sistema WinDev original.
const DEFAULT_POS_NAMES = ["RESTAURANTE", "BAR RECEPCAO", "FRIGOBAR"];

const SELECT = {
  id: true,
  name: true,
  code: true,
  location: true,
  operator: true,
  isCentral: true,
  active: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    let posLocations = await prisma.pOSLocation.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: SELECT,
    });

    if (posLocations.length === 0) {
      await prisma.pOSLocation.createMany({
        data: DEFAULT_POS_NAMES.map((name) => ({ tenantId, name, isCentral: name === "RESTAURANTE" })),
      });
      posLocations = await prisma.pOSLocation.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        select: SELECT,
      });
    }

    return NextResponse.json({ success: true, posLocations });
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

    const posLocation = await prisma.pOSLocation.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        code: codigo || null,
        location: localizacao || null,
        operator: operador || null,
        active: status !== "INATIVO",
      },
      select: SELECT,
    });

    return NextResponse.json({ success: true, posLocation }, { status: 201 });
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

    const updated = await prisma.pOSLocation.updateMany({
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
    const posLocation = await prisma.pOSLocation.findFirst({ where: { id, tenantId: session!.tenantId! }, select: SELECT });

    return NextResponse.json({ success: true, posLocation });
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

    const pos = await prisma.pOSLocation.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: {
        id: true,
        _count: { select: { transfersTo: true, consumptions: true, comandaSessions: true } },
      },
    });
    if (!pos) {
      return NextResponse.json({ success: false, error: "Ponto de venda não encontrado." }, { status: 404 });
    }
    if (pos._count.transfersTo > 0 || pos._count.consumptions > 0 || pos._count.comandaSessions > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Este ponto de venda já tem movimento (transferências, consumos ou comandas) e não pode ser excluído. Marque-o como inativo.",
        },
        { status: 409 }
      );
    }

    await prisma.pOSLocation.deleteMany({ where: { id, tenantId: session!.tenantId! } });

    return NextResponse.json({ success: true, message: "Ponto de venda excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/pdv] Erro ao excluir ponto de venda:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
