import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { runSupportAgentOnTicket } from "@/lib/platformSupportAgent";

// POST /api/tenant/support/tickets/[id]/messages — o hotel responde no chamado. Reabre o chamado
// se estava resolvido/fechado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const { id } = await params;
  const isAdmin = session.role === "TENANT_ADMIN" || session.role === "SUPER_ADMIN";

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }
  const content = String(body.content || "").trim();
  if (!content) return NextResponse.json({ success: false, error: "Mensagem vazia." }, { status: 400 });

  const ticket = await prisma.supportTicket.findFirst({
    where: { id, tenantId: session.tenantId, ...(isAdmin ? {} : { authorId: session.userId }) },
    select: { id: true, status: true },
  });
  if (!ticket) return NextResponse.json({ success: false, error: "Chamado não encontrado." }, { status: 404 });

  await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: id, senderType: "TENANT", senderName: session.name, content: content.slice(0, 4000) },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: { status: ["RESOLVED", "CLOSED"].includes(ticket.status) ? "OPEN" : ticket.status, updatedAt: new Date() },
    }),
  ]);

  // Deixa a IA tentar responder a nova pergunta antes da equipe humana.
  try {
    await runSupportAgentOnTicket(id);
  } catch (err) {
    console.error("[support] agente de IA falhou ao responder resposta do assinante:", err);
  }

  return NextResponse.json({ success: true });
}
