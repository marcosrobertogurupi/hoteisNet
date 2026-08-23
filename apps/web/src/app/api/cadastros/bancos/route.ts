import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const banks = await prisma.bank.findMany({
      where: { tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, banks });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, nomeBanco, codigoCompe, agencia, conta, chavePix } = body;

    if (!nomeBanco || !String(nomeBanco).trim()) {
      return NextResponse.json({ success: false, error: "O nome do banco é obrigatório." }, { status: 400 });
    }

    const bank = await prisma.bank.create({
      data: {
        tenantId: tenantId || DEFAULT_TENANT_ID,
        name: String(nomeBanco).trim(),
        bankCode: codigoCompe || null,
        agency: agencia || null,
        account: conta || null,
        pixKey: chavePix || null,
      },
    });

    return NextResponse.json({ success: true, bank }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/bancos] Erro ao criar banco:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, nomeBanco, codigoCompe, agencia, conta, chavePix } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do banco é obrigatório." }, { status: 400 });
    }
    if (!nomeBanco || !String(nomeBanco).trim()) {
      return NextResponse.json({ success: false, error: "O nome do banco é obrigatório." }, { status: 400 });
    }

    const bank = await prisma.bank.update({
      where: { id },
      data: {
        name: String(nomeBanco).trim(),
        bankCode: codigoCompe || null,
        agency: agencia || null,
        account: conta || null,
        pixKey: chavePix || null,
      },
    });

    return NextResponse.json({ success: true, bank });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/bancos] Erro ao atualizar banco:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do banco é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.bank.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Banco não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Banco excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/bancos] Erro ao excluir banco:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
