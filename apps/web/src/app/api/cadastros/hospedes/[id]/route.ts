import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/cadastros/hospedes/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const guest = await prisma.guest.findFirst({
      where: { id, tenantId: session.tenantId },
      include: {
        company: true,
        fnrhRecords: true,
        vehicles: { orderBy: { createdAt: "asc" } },
        checkins: {
          orderBy: { checkInDate: "desc" },
          include: {
            room: { select: { number: true } },
            charges: true,
          },
        },
      },
    });

    if (!guest) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    return NextResponse.json(guest);
  } catch (error) {
    console.error("[GET /api/cadastros/hospedes/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao buscar hóspede" }, { status: 500 });
  }
}

// PUT /api/cadastros/hospedes/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.guest.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    // updateMany (não update por id puro) repete o filtro de tenant também na escrita real — sem
    // isso, a checagem de existência acima não bastava para proteger contra IDOR: bastaria acertar
    // um id de hóspede de outro tenant que passasse a checagem (ex.: se ela fosse removida/burlada
    // num refactor futuro) para editar o registro de qualquer forma.
    await prisma.guest.updateMany({
      where: { id, tenantId: session.tenantId },
      data: {
        fullName: body.fullName ? body.fullName.trim().toUpperCase() : existing.fullName,
        cpf: body.cpf !== undefined ? body.cpf || null : existing.cpf,
        passport: body.passport !== undefined ? body.passport || null : existing.passport,
        birthDate: body.birthDate ? new Date(body.birthDate) : existing.birthDate,
        gender: body.gender || existing.gender,
        email: body.email !== undefined ? body.email || null : existing.email,
        phone: body.phone !== undefined ? body.phone || null : existing.phone,
        whatsappPhone: body.whatsappPhone !== undefined ? body.whatsappPhone || null : existing.whatsappPhone,
        hasWhatsapp: body.hasWhatsapp !== undefined ? body.hasWhatsapp : existing.hasWhatsapp,
        zipCode: body.zipCode !== undefined ? body.zipCode || null : existing.zipCode,
        street: body.street !== undefined ? body.street || null : existing.street,
        number: body.number !== undefined ? body.number || null : existing.number,
        neighborhood: body.neighborhood !== undefined ? body.neighborhood || null : existing.neighborhood,
        city: body.city !== undefined ? body.city || null : existing.city,
        state: body.state !== undefined ? body.state || null : existing.state,
        country: body.country || existing.country,
        companyId: body.companyId !== undefined ? body.companyId || null : existing.companyId,
      },
    });

    const updatedGuest = await prisma.guest.findUnique({ where: { id } });
    return NextResponse.json(updatedGuest);
  } catch (error) {
    console.error("[PUT /api/cadastros/hospedes/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao atualizar hóspede" }, { status: 500 });
  }
}

// DELETE /api/cadastros/hospedes/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await prisma.guest.deleteMany({
      where: { id, tenantId: session.tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Hóspede excluído com sucesso" });
  } catch (error) {
    console.error("[DELETE /api/cadastros/hospedes/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao excluir hóspede" }, { status: 500 });
  }
}
