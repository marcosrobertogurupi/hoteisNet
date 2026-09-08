import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/support/tickets/[id] — chamado + conversa. Só do próprio hotel (e, para não-admin,
// só se foi quem abriu).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const { id } = await params;
  const isAdmin = session.role === "TENANT_ADMIN" || session.role === "SUPER_ADMIN";

  const ticket = await prisma.supportTicket.findFirst({
    where: { id, tenantId: session.tenantId, ...(isAdmin ? {} : { authorId: session.userId }) },
    select: {
      id: true,
      subject: true,
      category: true,
      priority: true,
      status: true,
      aiResolved: true,
      createdAt: true,
      author: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, senderType: true, senderName: true, content: true, createdAt: true },
      },
    },
  });
  if (!ticket) return NextResponse.json({ success: false, error: "Chamado não encontrado." }, { status: 404 });

  return NextResponse.json({ success: true, ticket });
}
