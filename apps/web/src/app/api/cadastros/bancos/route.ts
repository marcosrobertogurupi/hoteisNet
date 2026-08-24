import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const banks = await prisma.bank.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, banks });
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
    const { nomeBanco, codigoCompe, agencia, conta, chavePix } = body;

    if (!nomeBanco || !String(nomeBanco).trim()) {
      return NextResponse.json({ success: false, error: "O nome do banco é obrigatório." }, { status: 400 });
    }

    const bank = await prisma.bank.create({
      data: {
        tenantId: session!.tenantId!,
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
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nomeBanco, codigoCompe, agencia, conta, chavePix } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do banco é obrigatório." }, { status: 400 });
    }
    if (!nomeBanco || !String(nomeBanco).trim()) {
      return NextResponse.json({ success: false, error: "O nome do banco é obrigatório." }, { status: 400 });
    }

    const updated = await prisma.bank.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(nomeBanco).trim(),
        bankCode: codigoCompe || null,
        agency: agencia || null,
        account: conta || null,
        pixKey: chavePix || null,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Banco não encontrado." }, { status: 404 });
    }
    const bank = await prisma.bank.findUnique({ where: { id } });

    return NextResponse.json({ success: true, bank });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/bancos] Erro ao atualizar banco:", error);
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
      return NextResponse.json({ success: false, error: "ID do banco é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.bank.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Banco não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Banco excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/bancos] Erro ao excluir banco:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
