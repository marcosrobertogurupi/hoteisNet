import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaintenanceUser } from "@/lib/maintenanceSession";
import { OPEN_MAINTENANCE_STAGES } from "@/lib/maintenance";

const RECENT_DAYS = 7;

// GET /api/manutencao-app/os — OS do colaborador logado: as abertas (o trabalho dele) e as
// resolvidas nos últimos dias (conferência). Só as atribuídas a ele, só do hotel dele.
export async function GET(req: NextRequest) {
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });

    const select = {
      id: true,
      number: true,
      stage: true,
      description: true,
      openedAt: true,
      expectedReleaseAt: true,
      resolvedAt: true,
      room: { select: { number: true, floor: true } },
      problemType: { select: { name: true } },
      waitReason: { select: { name: true } },
      _count: { select: { photos: true } },
    } as const;

    const [open, recent] = await Promise.all([
      prisma.maintenanceTicket.findMany({
        where: { tenantId: user.tenantId, assignedEmployeeId: user.employeeId, stage: { in: OPEN_MAINTENANCE_STAGES } },
        orderBy: { openedAt: "asc" },
        select,
      }),
      prisma.maintenanceTicket.findMany({
        where: {
          tenantId: user.tenantId,
          assignedEmployeeId: user.employeeId,
          stage: "RESOLVED",
          resolvedAt: { gte: new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000) },
        },
        orderBy: { resolvedAt: "desc" },
        take: 20,
        select,
      }),
    ]);

    const map = (t: (typeof open)[number]) => ({
      id: t.id,
      number: t.number,
      stage: t.stage,
      description: t.description,
      openedAt: t.openedAt,
      expectedReleaseAt: t.expectedReleaseAt,
      resolvedAt: t.resolvedAt,
      roomNumber: t.room.number,
      floor: t.room.floor || "",
      problemType: t.problemType.name,
      waitReason: t.waitReason?.name ?? null,
      photoCount: t._count.photos,
    });

    return NextResponse.json({ success: true, open: open.map(map), recent: recent.map(map) });
  } catch (error: any) {
    console.error("[GET /api/manutencao-app/os] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar as ordens de serviço." }, { status: 500 });
  }
}
