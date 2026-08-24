import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/cadastros/hospedes/[id]/veiculos
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
      select: { id: true },
    });
    if (!guest) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { guestId: id, tenantId: session.tenantId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("[GET /api/cadastros/hospedes/[id]/veiculos] Erro:", error);
    return NextResponse.json({ error: "Erro ao buscar veículos do hóspede" }, { status: 500 });
  }
}

// PUT /api/cadastros/hospedes/[id]/veiculos
// Recebe a lista completa de veículos do hóspede (como editada no formulário de cadastro) e
// sincroniza com o banco: remove os que não estão mais na lista e cria os novos (sem id ainda).
// Tanto o hóspede quanto os veículos são sempre filtrados pelo tenantId do hóspede, garantindo
// que o veículo de um assinante nunca fique visível/editável para outro.
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
    const veiculos: { id?: string; placaVeiculo: string; caractVeic?: string }[] = body.veiculos || [];

    const guest = await prisma.guest.findFirst({
      where: { id, tenantId: session.tenantId },
      select: { id: true, tenantId: true },
    });
    if (!guest) {
      return NextResponse.json({ error: "Hóspede não encontrado" }, { status: 404 });
    }

    const existing = await prisma.vehicle.findMany({
      where: { guestId: id, tenantId: guest.tenantId },
      select: { id: true },
    });
    const incomingIds = new Set(veiculos.filter((v) => v.id).map((v) => v.id));
    const toDeleteIds = existing.map((v) => v.id).filter((existingId) => !incomingIds.has(existingId));
    const toCreate = veiculos.filter((v) => !v.id && v.placaVeiculo?.trim());

    await prisma.$transaction([
      ...(toDeleteIds.length > 0
        ? [prisma.vehicle.deleteMany({ where: { id: { in: toDeleteIds }, guestId: id, tenantId: guest.tenantId } })]
        : []),
      ...(toCreate.length > 0
        ? [
            prisma.vehicle.createMany({
              data: toCreate.map((v) => ({
                tenantId: guest.tenantId,
                guestId: id,
                placa: v.placaVeiculo.trim().toUpperCase(),
                caracteristica: v.caractVeic?.trim() || null,
              })),
            }),
          ]
        : []),
    ]);

    const vehicles = await prisma.vehicle.findMany({
      where: { guestId: id, tenantId: guest.tenantId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("[PUT /api/cadastros/hospedes/[id]/veiculos] Erro:", error);
    return NextResponse.json({ error: "Erro ao salvar veículos do hóspede" }, { status: 500 });
  }
}
