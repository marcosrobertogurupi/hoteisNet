import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";

const STATUSES = ["PENDING", "CONFIRMED", "RECEIVED", "OVERDUE", "REFUNDED", "CHARGEBACK", "CANCELLED"];

// GET /api/admin/invoices — faturas do SaaS. ?tenantId= ?status= ?page= (25/página).
// Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || undefined;
  const status = (searchParams.get("status") || "").toUpperCase();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 25;

  const where: Record<string, unknown> = {};
  if (tenantId) where.tenantId = tenantId;
  if (STATUSES.includes(status)) where.status = status;

  const [total, invoices] = await Promise.all([
    prisma.saaSInvoice.count({ where }),
    prisma.saaSInvoice.findMany({
      where,
      orderBy: { dueDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        tenantId: true,
        cycle: true,
        amount: true,
        billingType: true,
        status: true,
        dueDate: true,
        paidAt: true,
        invoiceUrl: true,
        bankSlipUrl: true,
        manual: true,
        description: true,
        tenant: { select: { name: true, tradeName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total,
    invoices: invoices.map((i) => ({
      id: i.id,
      tenantId: i.tenantId,
      tenantName: i.tenant.tradeName || i.tenant.name,
      cycle: i.cycle,
      amount: i.amount,
      billingType: i.billingType,
      status: i.status,
      dueDate: i.dueDate,
      paidAt: i.paidAt,
      invoiceUrl: i.invoiceUrl,
      bankSlipUrl: i.bankSlipUrl,
      manual: i.manual,
      description: i.description,
    })),
  });
}
