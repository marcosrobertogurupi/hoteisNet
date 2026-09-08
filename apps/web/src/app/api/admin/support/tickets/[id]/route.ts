import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

const STATUSES = ["OPEN", "IN_PROGRESS", "AI_ANSWERED", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

// GET /api/admin/support/tickets/[id] — chamado + conversa. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      aiResolved: true,
      confidence: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { name: true, tradeName: true } },
      author: { select: { name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderType: true, senderName: true, content: true, createdAt: true },
      },
    },
  });
  if (!ticket) return NextResponse.json({ success: false, error: "Chamado não encontrado." }, { status: 404 });
  return NextResponse.json({ success: true, ticket: { ...ticket, tenantName: ticket.tenant.tradeName || ticket.tenant.name } });
}

// PATCH /api/admin/support/tickets/[id] — muda status/prioridade. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: { status?: string; priority?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) {
    if (!STATUSES.includes(String(body.status))) return NextResponse.json({ success: false, error: "Status inválido." }, { status: 400 });
    data.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(String(body.priority))) return NextResponse.json({ success: false, error: "Prioridade inválida." }, { status: 400 });
    data.priority = body.priority;
  }

  const updated = await prisma.supportTicket
    .update({ where: { id }, data, select: { tenantId: true, subject: true, status: true, priority: true } })
    .catch(() => null);
  if (!updated) return NextResponse.json({ success: false, error: "Chamado não encontrado." }, { status: 404 });

  await logPlatformAction({
    req,
    session: session!,
    action: "SUPPORT_TICKET_UPDATE",
    description: `Chamado "${updated.subject}" → ${updated.status}/${updated.priority}`,
    targetTenantId: updated.tenantId,
    entityType: "SupportTicket",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
