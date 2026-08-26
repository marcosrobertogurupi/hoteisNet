import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { recordKnowledgeRevision } from "@/lib/knowledgeBase";

// POST /api/tenant/knowledge-base/revisions/:id/revert — desfaz uma alteração de conteúdo,
// restaurando o `contentBefore` da revisão escolhida. Serve tanto para reverter uma edição humana
// quanto uma correção automática do Agente Operacional. O revert em si também gera uma nova
// KnowledgeRevision (nada é apagado do histórico). Qualquer usuário logado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { id } = await params;
    const revision = await prisma.knowledgeRevision.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!revision) {
      return NextResponse.json({ success: false, error: "Alteração não encontrada." }, { status: 404 });
    }
    if (revision.reverted) {
      return NextResponse.json({ success: false, error: "Esta alteração já foi desfeita." }, { status: 409 });
    }

    if (revision.targetType === "TOPIC") {
      const topic = await prisma.hotelKnowledgeTopic.findFirst({
        where: { id: revision.targetId, tenantId: session.tenantId },
      });
      if (!topic) return NextResponse.json({ success: false, error: "Tópico não existe mais." }, { status: 404 });
      await prisma.hotelKnowledgeTopic.updateMany({
        where: { id: topic.id, tenantId: session.tenantId },
        data: { content: revision.contentBefore, updatedByName: session.name },
      });
      await recordKnowledgeRevision({
        tenantId: session.tenantId,
        targetType: "TOPIC",
        targetId: topic.id,
        contentBefore: topic.content,
        contentAfter: revision.contentBefore,
        changedByName: session.name,
        reason: "Desfez uma alteração anterior",
      });
    } else {
      const entry = await prisma.supportKnowledgeBase.findFirst({
        where: { id: revision.targetId, tenantId: session.tenantId },
      });
      if (!entry) return NextResponse.json({ success: false, error: "Entrada não existe mais." }, { status: 404 });
      await prisma.supportKnowledgeBase.updateMany({
        where: { id: entry.id, tenantId: session.tenantId },
        data: { resolution: revision.contentBefore, updatedByName: session.name },
      });
      await recordKnowledgeRevision({
        tenantId: session.tenantId,
        targetType: "ENTRY",
        targetId: entry.id,
        contentBefore: entry.resolution,
        contentAfter: revision.contentBefore,
        changedByName: session.name,
        reason: "Desfez uma alteração anterior",
      });
    }

    await prisma.knowledgeRevision.updateMany({
      where: { id: revision.id, tenantId: session.tenantId },
      data: { reverted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/tenant/knowledge-base/revisions/:id/revert] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao desfazer alteração." }, { status: 500 });
  }
}
