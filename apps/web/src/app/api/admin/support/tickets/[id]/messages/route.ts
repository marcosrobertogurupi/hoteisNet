import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

// POST /api/admin/support/tickets/[id]/messages — resposta oficial do suporte da plataforma.
// Move o chamado para IN_PROGRESS se estava aberto. Edição: PLATFORM_ADMIN / SUPER_ADMIN
// (PLATFORM_SUPPORT também responde — é o papel de atendimento; ajuste aqui se necessário).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: { content?: string; resolve?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }
  const content = String(body.content || "").trim();
  if (!content) return NextResponse.json({ success: false, error: "Mensagem vazia." }, { status: 400 });

  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, status: true, tenantId: true } });
  if (!ticket) return NextResponse.json({ success: false, error: "Chamado não encontrado." }, { status: 404 });

  const nextStatus = body.resolve ? "RESOLVED" : ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status;

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: id, senderType: "PLATFORM", senderName: `${session!.name} (Suporte Hoteis.Net)`, content: content.slice(0, 4000) },
    }),
    prisma.supportTicket.update({ where: { id }, data: { status: nextStatus, updatedAt: new Date() } }),
  ]);

  await logPlatformAction({
    req,
    session: session!,
    action: body.resolve ? "SUPPORT_TICKET_RESOLVE" : "SUPPORT_TICKET_REPLY",
    description: `Resposta da equipe no chamado ${id}${body.resolve ? " (resolvido)" : ""}.`,
    targetTenantId: ticket.tenantId,
    entityType: "SupportTicket",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
