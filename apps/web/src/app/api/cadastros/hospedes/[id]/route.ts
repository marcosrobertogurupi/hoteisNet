import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/hospedes/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guest = await prisma.guest.findFirst({
      where: { id, tenantId: DEFAULT_TENANT_ID },
      include: { company: true, fnrhRecords: true },
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
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.guest.findFirst({
      where: { id, tenantId: DEFAULT_TENANT_ID },
    });

    if (!existing) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    const updatedGuest = await prisma.guest.update({
      where: { id },
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
        city: body.city !== undefined ? body.city || null : existing.city,
        state: body.state !== undefined ? body.state || null : existing.state,
        country: body.country || existing.country,
        companyId: body.companyId !== undefined ? body.companyId || null : existing.companyId,
      },
    });

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
    const { id } = await params;
    const existing = await prisma.guest.findFirst({
      where: { id, tenantId: DEFAULT_TENANT_ID },
    });

    if (!existing) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    await prisma.guest.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Hóspede excluído com sucesso" });
  } catch (error) {
    console.error("[DELETE /api/cadastros/hospedes/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao excluir hóspede" }, { status: 500 });
  }
}
