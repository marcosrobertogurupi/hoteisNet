import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";

const STATUSES = ["OPEN", "IN_PROGRESS", "AI_ANSWERED", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

// GET /api/admin/support/tickets — fila global de chamados de todos os assinantes.
// ?status= ?priority= ?tenantId= ?page= (25/página). Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "").toUpperCase();
  const priority = (searchParams.get("priority") || "").toUpperCase();
  const tenantId = searchParams.get("tenantId") || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 25;

  const where: Record<string, unknown> = {};
  if (STATUSES.includes(status)) where.status = status;
  if (PRIORITIES.includes(priority)) where.priority = priority;
  if (tenantId) where.tenantId = tenantId;

  const [total, tickets, openCount] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        aiResolved: true,
        confidence: true,
        createdAt: true,
        updatedAt: true,
        tenant: { select: { name: true, tradeName: true } },
        author: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  return NextResponse.json({
    success: true,
    page,
    pageSize,
    total,
    openCount,
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      aiResolved: t.aiResolved,
      confidence: t.confidence,
      tenantName: t.tenant.tradeName || t.tenant.name,
      authorName: t.author.name,
      messages: t._count.messages,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}
