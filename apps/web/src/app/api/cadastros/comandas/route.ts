import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const tables = await prisma.hotelTable.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { number: "asc" },
    });
    return NextResponse.json({ success: true, tables });
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
    const { numero, descricao, tipo, status } = body;

    if (!numero || !String(numero).trim()) {
      return NextResponse.json({ success: false, error: "O número da mesa/comanda é obrigatório." }, { status: 400 });
    }

    const table = await prisma.hotelTable.create({
      data: {
        tenantId: session!.tenantId!,
        number: String(numero).trim(),
        description: descricao || null,
        type: tipo || "MESA",
        status: status || "LIVRE",
      },
    });

    return NextResponse.json({ success: true, table }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/comandas] Erro ao criar mesa/comanda:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, numero, descricao, tipo, status } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da mesa/comanda é obrigatório." }, { status: 400 });
    }
    if (!numero || !String(numero).trim()) {
      return NextResponse.json({ success: false, error: "O número da mesa/comanda é obrigatório." }, { status: 400 });
    }

    const updated = await prisma.hotelTable.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        number: String(numero).trim(),
        description: descricao || null,
        type: tipo || "MESA",
        status: status || "LIVRE",
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Mesa/comanda não encontrada." }, { status: 404 });
    }
    const table = await prisma.hotelTable.findUnique({ where: { id } });

    return NextResponse.json({ success: true, table });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/comandas] Erro ao atualizar mesa/comanda:", error);
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
      return NextResponse.json({ success: false, error: "ID da mesa/comanda é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.hotelTable.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Mesa/comanda não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Mesa/comanda excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/comandas] Erro ao excluir mesa/comanda:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
