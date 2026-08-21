import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/housekeeping-tasks?tenantId=... — tarefas de limpeza em aberto (PENDING ou
// IN_PROGRESS), usado na tela de atribuição manual (Governança) e no selo visual do Mapa de Quartos.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const tasks = await prisma.housekeepingTask.findMany({
      where: { tenantId: resolvedTenantId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      include: {
        housekeeper: { select: { id: true, name: true, photoUrl: true } },
        room: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    console.error("[GET /api/tenant/housekeeping-tasks] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar tarefas de limpeza." },
      { status: 500 }
    );
  }
}

// POST /api/tenant/housekeeping-tasks — atribui (ou reatribui) um quarto a uma governanta. Cria
// uma tarefa PENDING; se já existir uma tarefa PENDING para o quarto, apenas troca a governanta.
// Um quarto com tarefa IN_PROGRESS não pode ser reatribuído (limpeza já em andamento).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, roomId, housekeeperId, type } = body;
    const taskType: "CHECKOUT" | "OCCUPIED" = type === "OCCUPIED" ? "OCCUPIED" : "CHECKOUT";

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }
    if (!roomId || !housekeeperId) {
      return NextResponse.json({ success: false, error: "Quarto e governanta são obrigatórios." }, { status: 400 });
    }

    const [room, housekeeper] = await Promise.all([
      prisma.room.findFirst({ where: { id: roomId, tenantId: resolvedTenantId } }),
      prisma.housekeeper.findFirst({ where: { id: housekeeperId, tenantId: resolvedTenantId, active: true } }),
    ]);
    if (!room) return NextResponse.json({ success: false, error: "Quarto não encontrado." }, { status: 404 });
    if (!housekeeper) return NextResponse.json({ success: false, error: "Governanta não encontrada ou inativa." }, { status: 404 });

    // OCCUPIED (arrumação com hóspede no quarto) só faz sentido em quarto ocupado; CHECKOUT
    // (limpeza profunda pós-saída) só em quarto vago aguardando higienização.
    if (taskType === "OCCUPIED" && room.status !== "OCCUPIED") {
      return NextResponse.json(
        { success: false, error: "Arrumação com hóspede só pode ser atribuída a um quarto ocupado." },
        { status: 400 }
      );
    }
    if (taskType === "CHECKOUT" && room.status !== "VACANT_DIRTY") {
      return NextResponse.json(
        { success: false, error: "Limpeza pós check-out só pode ser atribuída a um quarto vago aguardando higienização." },
        { status: 400 }
      );
    }

    const existing = await prisma.housekeepingTask.findFirst({
      where: { tenantId: resolvedTenantId, roomId, type: taskType, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });

    if (existing?.status === "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, error: "Este quarto já está com limpeza em andamento e não pode ser reatribuído." },
        { status: 409 }
      );
    }

    const task = existing
      ? await prisma.housekeepingTask.update({
          where: { id: existing.id },
          data: { housekeeperId, assignedAt: new Date() },
          include: { housekeeper: { select: { id: true, name: true, photoUrl: true } }, room: { select: { id: true, number: true } } },
        })
      : await prisma.housekeepingTask.create({
          data: { tenantId: resolvedTenantId, roomId, housekeeperId, type: taskType, status: "PENDING", assignedAt: new Date() },
          include: { housekeeper: { select: { id: true, name: true, photoUrl: true } }, room: { select: { id: true, number: true } } },
        });

    return NextResponse.json({ success: true, task });
  } catch (error: any) {
    console.error("[POST /api/tenant/housekeeping-tasks] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao atribuir quarto." },
      { status: 500 }
    );
  }
}
