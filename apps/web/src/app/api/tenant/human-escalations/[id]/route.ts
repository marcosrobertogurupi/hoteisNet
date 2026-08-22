import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// PATCH /api/tenant/human-escalations/:id — marca uma escalação como resolvida (sempre manual
// nesta v1, nenhuma detecção automática). Chamado pelo botão "Marcar como resolvido" no sino.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { id } = await params;
    const result = await prisma.humanEscalation.updateMany({
      where: { id, tenantId: session.tenantId },
      data: { resolved: true, resolvedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Escalação não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/human-escalations/:id] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao resolver escalação." }, { status: 500 });
  }
}
