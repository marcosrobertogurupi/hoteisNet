import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { runSupportAgentOnTicket } from "@/lib/platformSupportAgent";

const CATEGORIES = ["FNRH / Governo", "Financeiro", "WhatsApp / IA", "Reservas & Check-in", "Fiscal / PDV", "Outro"];

// GET /api/tenant/support/tickets — chamados de suporte do hotel. TENANT_ADMIN vê todos os do
// hotel; os demais veem só os que abriram.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  const isAdmin = session.role === "TENANT_ADMIN" || session.role === "SUPER_ADMIN";
  const tickets = await prisma.supportTicket.findMany({
    where: { tenantId: session.tenantId, ...(isAdmin ? {} : { authorId: session.userId }) },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      aiResolved: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { name: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({
    success: true,
    categories: CATEGORIES,
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      aiResolved: t.aiResolved,
      authorName: t.author.name,
      messages: t._count.messages,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  });
}

// POST /api/tenant/support/tickets — abre um chamado. body: { subject, category, message }.
export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  let body: { subject?: string; category?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "Outro";
  if (!subject || !message) {
    return NextResponse.json({ success: false, error: "Assunto e mensagem são obrigatórios." }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: session.tenantId,
      authorId: session.userId,
      subject: subject.slice(0, 200),
      category,
      status: "OPEN",
      messages: {
        create: { senderType: "TENANT", senderName: session.name, content: message.slice(0, 4000) },
      },
    },
    select: { id: true },
  });

  // Primeira resposta pela IA (RAG leve sobre a base do produto). Best-effort e limitada por
  // timeout — se falhar ou não tiver confiança, o chamado fica OPEN para a equipe humana.
  try {
    await runSupportAgentOnTicket(ticket.id);
  } catch (err) {
    console.error("[support] agente de IA falhou ao responder chamado novo:", err);
  }

  return NextResponse.json({ success: true, ticketId: ticket.id });
}
