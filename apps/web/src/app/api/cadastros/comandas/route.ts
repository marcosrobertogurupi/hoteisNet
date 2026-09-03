import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Cadastro de "Mesas & Comandas" da Central de Cadastros. São dois conceitos com modelos
// próprios, unificados nesta única tela:
//   - MESA            -> HotelTable  (referência visual, opcional no atendimento)
//   - COMANDA_AVULSA  -> Comanda     (cartão numerado; é o que o PDV do restaurante consome)
// O cadastro de comandas da aba "Fiscal & PDV → Comandas" opera o MESMO modelo Comanda.

type Item = {
  id: string;
  number: string;
  description: string | null;
  type: "MESA" | "COMANDA_AVULSA";
  status: "LIVRE" | "ABERTA";
  active: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const [tables, comandas] = await Promise.all([
      prisma.hotelTable.findMany({
        where: { tenantId, type: "MESA" },
        orderBy: { number: "asc" },
        select: { id: true, number: true, description: true, status: true },
      }),
      prisma.comanda.findMany({
        where: { tenantId },
        orderBy: { number: "asc" },
        select: { id: true, number: true, description: true, active: true },
      }),
    ]);

    const items: Item[] = [
      ...comandas.map((c) => ({
        id: c.id,
        number: c.number,
        description: c.description,
        type: "COMANDA_AVULSA" as const,
        status: "LIVRE" as const,
        active: c.active,
      })),
      ...tables.map((t) => ({
        id: t.id,
        number: t.number,
        description: t.description,
        type: "MESA" as const,
        status: (t.status === "ABERTA" ? "ABERTA" : "LIVRE") as "LIVRE" | "ABERTA",
        active: true,
      })),
    ];

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const numero = String(body.numero || "").trim();
    const tipo = body.tipo === "COMANDA_AVULSA" ? "COMANDA_AVULSA" : "MESA";
    if (!numero) {
      return NextResponse.json({ success: false, error: "O número é obrigatório." }, { status: 400 });
    }

    if (tipo === "COMANDA_AVULSA") {
      // Criação em lote: "1-50" cria as comandas de 1 a 50.
      const range = numero.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (end < start || end - start > 500) {
          return NextResponse.json({ success: false, error: "Intervalo inválido (máx. 500 comandas por vez)." }, { status: 400 });
        }
        const numbers = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
        const result = await prisma.comanda.createMany({
          data: numbers.map((n) => ({ tenantId, number: n })),
          skipDuplicates: true,
        });
        return NextResponse.json({ success: true, criadas: result.count }, { status: 201 });
      }

      const existing = await prisma.comanda.findFirst({ where: { tenantId, number: numero }, select: { id: true } });
      if (existing) {
        return NextResponse.json({ success: false, error: `Já existe a comanda ${numero}.` }, { status: 409 });
      }
      const comanda = await prisma.comanda.create({
        data: { tenantId, number: numero, description: body.descricao ? String(body.descricao).trim() : null },
      });
      return NextResponse.json({ success: true, id: comanda.id }, { status: 201 });
    }

    const table = await prisma.hotelTable.create({
      data: {
        tenantId,
        number: numero,
        description: body.descricao || null,
        type: "MESA",
        status: body.status === "ABERTA" ? "ABERTA" : "LIVRE",
      },
    });
    return NextResponse.json({ success: true, id: table.id }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/comandas] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const body = await req.json();
    const numero = String(body.numero || "").trim();
    if (!body.id) {
      return NextResponse.json({ success: false, error: "ID é obrigatório." }, { status: 400 });
    }
    if (!numero) {
      return NextResponse.json({ success: false, error: "O número é obrigatório." }, { status: 400 });
    }

    // Descobre em qual modelo o registro vive.
    const isComanda = await prisma.comanda.findFirst({ where: { id: body.id, tenantId }, select: { id: true } });
    if (isComanda) {
      const clash = await prisma.comanda.findFirst({
        where: { tenantId, number: numero, id: { not: body.id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ success: false, error: `Já existe a comanda ${numero}.` }, { status: 409 });

      await prisma.comanda.updateMany({
        where: { id: body.id, tenantId },
        data: {
          number: numero,
          description: body.descricao ? String(body.descricao).trim() : null,
          active: body.status !== "INATIVA",
        },
      });
      return NextResponse.json({ success: true });
    }

    const updated = await prisma.hotelTable.updateMany({
      where: { id: body.id, tenantId },
      data: {
        number: numero,
        description: body.descricao || null,
        type: "MESA",
        status: body.status === "ABERTA" ? "ABERTA" : "LIVRE",
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Registro não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/comandas] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId!;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID é obrigatório." }, { status: 400 });
    }

    const comanda = await prisma.comanda.findFirst({
      where: { id, tenantId },
      select: { _count: { select: { sessions: true } } },
    });
    if (comanda) {
      if (comanda._count.sessions > 0) {
        return NextResponse.json(
          { success: false, error: "Esta comanda já foi usada em atendimentos e não pode ser excluída. Desative-a." },
          { status: 409 }
        );
      }
      await prisma.comanda.deleteMany({ where: { id, tenantId } });
      return NextResponse.json({ success: true, message: "Comanda excluída com sucesso." });
    }

    const table = await prisma.hotelTable.findFirst({
      where: { id, tenantId },
      select: { _count: { select: { comandaSessions: true } } },
    });
    if (!table) {
      return NextResponse.json({ success: false, error: "Registro não encontrado." }, { status: 404 });
    }
    if (table._count.comandaSessions > 0) {
      return NextResponse.json(
        { success: false, error: "Esta mesa já foi usada em atendimentos e não pode ser excluída." },
        { status: 409 }
      );
    }
    await prisma.hotelTable.deleteMany({ where: { id, tenantId } });
    return NextResponse.json({ success: true, message: "Mesa excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/comandas] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
