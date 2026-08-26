import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { recordKnowledgeRevision } from "@/lib/knowledgeBase";
import { KNOWLEDGE_TOPIC_KEYS } from "@/lib/knowledgeTopics";
import type { KnowledgeTopicKey } from "@prisma/client";

const TOPIC_KEYS = new Set<string>(KNOWLEDGE_TOPIC_KEYS);
const VALID_STATUS = new Set(["ACTIVE", "PENDING_REVIEW", "ARCHIVED"]);

// PATCH /api/tenant/knowledge-base/:id — edita uma entrada da base, aprova uma sugestão do agente
// (status -> ACTIVE) ou arquiva. Qualquer usuário logado (mesmo critério do CRUD já existente).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.supportKnowledgeBase.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada." }, { status: 404 });
    }

    const data: Record<string, any> = {};
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.category === "string") data.category = body.category.trim();
    if (typeof body.question === "string" && body.question.trim()) data.question = body.question.trim();
    if (typeof body.resolution === "string") data.resolution = body.resolution;
    if (body.topicKey === null) data.topicKey = null;
    else if (typeof body.topicKey === "string" && TOPIC_KEYS.has(body.topicKey)) {
      data.topicKey = body.topicKey as KnowledgeTopicKey;
    }
    if (typeof body.status === "string" && VALID_STATUS.has(body.status)) {
      data.status = body.status;
      data.verified = body.status === "ACTIVE";
    }
    if (body.markReviewed === true) data.lastReviewedAt = new Date();

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para atualizar." }, { status: 400 });
    }

    data.updatedByName = session.name;

    // Filtro de tenant repetido na própria escrita (regra 3 do CLAUDE.md).
    const updated = await prisma.supportKnowledgeBase.updateMany({
      where: { id, tenantId: session.tenantId },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada." }, { status: 404 });
    }

    if (data.resolution !== undefined && data.resolution !== existing.resolution) {
      await recordKnowledgeRevision({
        tenantId: session.tenantId,
        targetType: "ENTRY",
        targetId: id,
        contentBefore: existing.resolution,
        contentAfter: data.resolution,
        changedByName: session.name,
        reason: existing.status === "PENDING_REVIEW" && data.status === "ACTIVE" ? "Sugestão do agente aprovada" : null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/knowledge-base/:id] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar conhecimento." }, { status: 500 });
  }
}

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
