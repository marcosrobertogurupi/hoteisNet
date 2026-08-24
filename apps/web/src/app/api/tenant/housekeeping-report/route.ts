import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/housekeeping-report?from=&to=&housekeeperId= — relatório de limpezas
// concluídas (DONE): quantidade e duração, agregado geral e por governanta. Usado no painel de
// relatório em Cadastros > Governantas. `from`/`to` filtram por finishedAt (padrão: últimos 30 dias).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const housekeeperIdParam = searchParams.get("housekeeperId");

    const from = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = toParam ? new Date(`${toParam}T23:59:59`) : new Date();

    const tasks = await prisma.housekeepingTask.findMany({
      where: {
        tenantId: resolvedTenantId,
        status: "DONE",
        finishedAt: { gte: from, lte: to },
        ...(housekeeperIdParam ? { housekeeperId: housekeeperIdParam } : {}),
      },
      select: {
        type: true,
        durationSeconds: true,
        finishedAt: true,
        housekeeperId: true,
        housekeeper: { select: { id: true, name: true, photoUrl: true } },
        room: { select: { number: true } },
      },
      orderBy: { finishedAt: "desc" },
    });

    const overall = {
      totalTasks: tasks.length,
      checkoutCount: tasks.filter((t) => t.type === "CHECKOUT").length,
      occupiedCount: tasks.filter((t) => t.type === "OCCUPIED").length,
      totalDurationSeconds: tasks.reduce((sum, t) => sum + (t.durationSeconds || 0), 0),
      avgDurationSeconds: tasks.length
        ? Math.round(tasks.reduce((sum, t) => sum + (t.durationSeconds || 0), 0) / tasks.length)
        : 0,
    };

    const byHousekeeper = new Map<
      string,
      {
        housekeeperId: string;
        name: string;
        photoUrl: string | null;
        totalTasks: number;
        checkoutCount: number;
        occupiedCount: number;
        totalDurationSeconds: number;
      }
    >();

    for (const t of tasks) {
      if (!t.housekeeperId || !t.housekeeper) continue;
      const entry = byHousekeeper.get(t.housekeeperId) || {
        housekeeperId: t.housekeeperId,
        name: t.housekeeper.name,
        photoUrl: t.housekeeper.photoUrl,
        totalTasks: 0,
        checkoutCount: 0,
        occupiedCount: 0,
        totalDurationSeconds: 0,
      };
      entry.totalTasks += 1;
      if (t.type === "CHECKOUT") entry.checkoutCount += 1;
      else entry.occupiedCount += 1;
      entry.totalDurationSeconds += t.durationSeconds || 0;
      byHousekeeper.set(t.housekeeperId, entry);
    }

    const perHousekeeper = Array.from(byHousekeeper.values())
      .map((h) => ({
        ...h,
        avgDurationSeconds: h.totalTasks ? Math.round(h.totalDurationSeconds / h.totalTasks) : 0,
      }))
      .sort((a, b) => b.totalTasks - a.totalTasks);

    const recentTasks = tasks.slice(0, 100).map((t) => ({
      housekeeperName: t.housekeeper?.name || "—",
      roomNumber: t.room.number,
      type: t.type,
      durationSeconds: t.durationSeconds,
      finishedAt: t.finishedAt,
    }));

    return NextResponse.json({
      success: true,
      period: { from: from.toISOString(), to: to.toISOString() },
      overall,
      perHousekeeper,
      recentTasks,
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/housekeeping-report] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao gerar relatório de limpezas." },
      { status: 500 }
    );
  }
}
