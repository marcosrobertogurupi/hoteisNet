import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const employees = await prisma.employee.findMany({
      where: { tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, employees });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, nome, cargo, cpf, telefone, email, status } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do colaborador é obrigatório." }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: {
        tenantId: tenantId || DEFAULT_TENANT_ID,
        name: String(nome).trim(),
        role: cargo || null,
        cpf: cpf || null,
        phone: telefone || null,
        email: email || null,
        active: status !== "INATIVO",
      },
    });

    return NextResponse.json({ success: true, employee }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/colaboradores] Erro ao criar colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, nome, cargo, cpf, telefone, email, status } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do colaborador é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do colaborador é obrigatório." }, { status: 400 });
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name: String(nome).trim(),
        role: cargo || null,
        cpf: cpf || null,
        phone: telefone || null,
        email: email || null,
        active: status !== "INATIVO",
      },
    });

    return NextResponse.json({ success: true, employee });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/colaboradores] Erro ao atualizar colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do colaborador é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.employee.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Colaborador não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Colaborador excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/colaboradores] Erro ao excluir colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
