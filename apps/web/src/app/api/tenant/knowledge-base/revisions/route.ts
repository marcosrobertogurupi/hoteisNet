import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { KNOWLEDGE_TOPIC_TITLES } from "@/lib/knowledgeTopics";

// GET /api/tenant/knowledge-base/revisions — histórico de alterações de conteúdo da base
// (tópicos e entradas), mais recentes primeiro. Carregado sob demanda quando o usuário abre o
// painel "Histórico de alterações" — mantém o GET principal da base enxuto.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const revisions = await prisma.knowledgeRevision.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    // Resolve um rótulo legível do alvo (título do tópico ou da entrada) para a tela.
    const topicIds = revisions.filter((r) => r.targetType === "TOPIC").map((r) => r.targetId);
    const entryIds = revisions.filter((r) => r.targetType === "ENTRY").map((r) => r.targetId);
    const [topics, entries] = await Promise.all([
      topicIds.length
        ? prisma.hotelKnowledgeTopic.findMany({ where: { id: { in: topicIds } }, select: { id: true, topicKey: true } })
        : [],
      entryIds.length
        ? prisma.supportKnowledgeBase.findMany({ where: { id: { in: entryIds } }, select: { id: true, title: true } })
        : [],
    ]);
    const labelById = new Map<string, string>([
      ...topics.map((t) => [t.id, KNOWLEDGE_TOPIC_TITLES[t.topicKey]] as [string, string]),
      ...entries.map((e) => [e.id, e.title] as [string, string]),
    ]);

    return NextResponse.json({
      success: true,
      revisions: revisions.map((r) => ({ ...r, targetLabel: labelById.get(r.targetId) || "(removido)" })),
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/knowledge-base/revisions] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar histórico." }, { status: 500 });
  }
}
