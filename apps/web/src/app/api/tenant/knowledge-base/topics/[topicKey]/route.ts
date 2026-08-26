import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { recordKnowledgeRevision } from "@/lib/knowledgeBase";
import { KNOWLEDGE_TOPIC_KEYS } from "@/lib/knowledgeTopics";
import type { KnowledgeTopicKey } from "@prisma/client";

const TOPIC_KEYS = new Set<string>(KNOWLEDGE_TOPIC_KEYS);

// PATCH /api/tenant/knowledge-base/topics/:topicKey — edita o conteúdo de um dos 12 documentos por
// área de dúvida, ou marca como revisado ("o conteúdo está atualizado"). Qualquer usuário logado.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ topicKey: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { topicKey } = await params;
    if (!TOPIC_KEYS.has(topicKey)) {
      return NextResponse.json({ success: false, error: "Tópico inválido." }, { status: 400 });
    }

    const body = await req.json();
    const existing = await prisma.hotelKnowledgeTopic.findFirst({
      where: { tenantId: session.tenantId, topicKey: topicKey as KnowledgeTopicKey },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tópico não encontrado." }, { status: 404 });
    }

    const data: Record<string, any> = { updatedByName: session.name };
    let newContent = existing.content;
    if (typeof body.content === "string") {
      newContent = body.content;
      data.content = newContent;
    }
    if (body.markReviewed === true) {
      data.lastReviewedAt = new Date();
      data.lastReviewedByName = session.name;
    }
    if (typeof body.active === "boolean") data.active = body.active;

    // Filtro de tenant repetido na própria escrita (regra 3 do CLAUDE.md).
    const updated = await prisma.hotelKnowledgeTopic.updateMany({
      where: { id: existing.id, tenantId: session.tenantId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Tópico não encontrado." }, { status: 404 });
    }

    await recordKnowledgeRevision({
      tenantId: session.tenantId,
      targetType: "TOPIC",
      targetId: existing.id,
      contentBefore: existing.content,
      contentAfter: newContent,
      changedByName: session.name,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/knowledge-base/topics/:topicKey] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar tópico." }, { status: 500 });
  }
}
