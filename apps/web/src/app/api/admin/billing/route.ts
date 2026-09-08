import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";
import { computeMrr } from "@/lib/saasBilling";
import { asaasEnabled } from "@/lib/asaas";

// GET /api/admin/billing — visão financeira consolidada do SaaS. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [mrr, byStatus, openInvoices, upcoming] = await Promise.all([
    computeMrr(),
    prisma.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.saaSInvoice.findMany({
      where: { status: { in: ["PENDING", "OVERDUE"] } },
      select: { amount: true, status: true, dueDate: true },
    }),
    prisma.saASSubscription.count({
      where: { active: true, nextBilling: { gte: now, lte: in30 }, tenant: { status: { not: "CANCELLED" } } },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const overdueAmount = openInvoices
    .filter((i) => i.status === "OVERDUE" || i.dueDate < now)
    .reduce((s, i) => s + Number(i.amount), 0);
  const pendingAmount = openInvoices.reduce((s, i) => s + Number(i.amount), 0);

  return NextResponse.json({
    success: true,
    asaasConfigured: asaasEnabled(),
    mrr,
    arr: Math.round(mrr * 12 * 100) / 100,
    tenantsByStatus: statusCounts,
    openInvoicesCount: openInvoices.length,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    upcomingBillings30d: upcoming,
  });
}
