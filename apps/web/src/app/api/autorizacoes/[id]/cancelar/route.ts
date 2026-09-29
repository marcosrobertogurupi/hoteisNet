import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

// POST /api/autorizacoes/[id]/cancelar — o operador desistiu do evento ("Cancelar o evento").
// Nada é autorizado; um link já enviado ao autorizador deixa de valer (status sai de PENDENTE).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const { id } = await params;
  const updated = await prisma.criticalAuthorization.updateMany({
    where: { id, tenantId: session.tenantId, requestedById: session.userId, status: { in: ["PENDENTE", "APROVADA"] } },
    data: { status: "CANCELADA" },
  });
  if (updated.count === 1) {
    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "CRITICAL_AUTH_CANCEL",
      description: `${session.name} cancelou o evento que aguardava autorização.`,
      entityType: "CRITICAL_AUTHORIZATION",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });
  }
  return NextResponse.json({ success: true });
}
