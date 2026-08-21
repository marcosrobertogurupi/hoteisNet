import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// DELETE /api/tenant/knowledge-base/:id — remove uma entrada da base de conhecimento do tenant.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { id } = await params;
    const result = await prisma.supportKnowledgeBase.deleteMany({ where: { id, tenantId: session.tenantId } });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/tenant/knowledge-base/:id] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover conhecimento." }, { status: 500 });
  }
}
