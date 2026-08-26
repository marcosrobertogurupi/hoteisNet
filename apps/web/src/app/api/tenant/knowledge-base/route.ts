import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureKnowledgeTopics } from "@/lib/knowledgeBase";
import { KNOWLEDGE_TOPIC_KEYS } from "@/lib/knowledgeTopics";
import type { KnowledgeTopicKey } from "@prisma/client";

const TOPIC_ORDER = new Map(KNOWLEDGE_TOPIC_KEYS.map((k, i) => [k, i]));

function isTopicKey(v: unknown): v is KnowledgeTopicKey {
  return typeof v === "string" && TOPIC_ORDER.has(v as KnowledgeTopicKey);
}

// GET /api/tenant/knowledge-base — devolve a Base de Conhecimento do tenant logado:
//  - topics: os 12 "documentos" por área de dúvida que o hotel mantém (semeados na 1ª vez)
//  - entries: perguntas+respostas pontuais (todos os status; a tela separa ativas/pendentes/arquivadas)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    await ensureKnowledgeTopics(session.tenantId);

    const { searchParams } = new URL(req.url);
    const agentType = searchParams.get("agentType");

    const [topics, entries] = await Promise.all([
      prisma.hotelKnowledgeTopic.findMany({ where: { tenantId: session.tenantId } }),
      prisma.supportKnowledgeBase.findMany({
        where: {
          tenantId: session.tenantId,
          ...(agentType && ["SUPPORT", "OPERATIONAL"].includes(agentType)
            ? { agentType: agentType as "SUPPORT" | "OPERATIONAL" }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    topics.sort((a, b) => (TOPIC_ORDER.get(a.topicKey) ?? 99) - (TOPIC_ORDER.get(b.topicKey) ?? 99));

    return NextResponse.json({ success: true, topics, entries });
  } catch (error: any) {
    console.error("[GET /api/tenant/knowledge-base] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar base de conhecimento." }, { status: 500 });
  }
}

// POST /api/tenant/knowledge-base — cria uma entrada pergunta+resposta. Criação manual pela tela
// (qualquer usuário logado) nasce sempre ACTIVE. Sugestões do agente (PENDING_REVIEW) são criadas
// em outro caminho (webhook, ao escalar) e nunca por esta rota.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const body = await req.json();
    const { title, category, question, resolution, agentType, topicKey } = body;

    if (!title || !question || !resolution) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: title, question, resolution." },
        { status: 400 }
      );
    }

    const entry = await prisma.supportKnowledgeBase.create({
      data: {
        tenantId: session.tenantId,
        title,
        category: typeof category === "string" ? category : "",
        question,
        resolution,
        agentType: agentType === "OPERATIONAL" ? "OPERATIONAL" : "SUPPORT",
        topicKey: isTopicKey(topicKey) ? topicKey : null,
        sourceType: "MANUAL",
        status: "ACTIVE",
        verified: true,
        lastReviewedAt: new Date(),
        updatedByName: session.name,
      },
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    console.error("[POST /api/tenant/knowledge-base] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar conhecimento." }, { status: 500 });
  }
}
