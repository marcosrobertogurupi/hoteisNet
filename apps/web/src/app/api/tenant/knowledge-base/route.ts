import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/knowledge-base — lista a base de conhecimento do tenant logado (o mecanismo de
// "aprendizado" dos agentes: pergunta+resposta reaproveitada em conversas futuras parecidas).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentType = searchParams.get("agentType");

    const entries = await prisma.supportKnowledgeBase.findMany({
      where: {
        tenantId: session.tenantId,
        ...(agentType && ["SUPPORT", "OPERATIONAL"].includes(agentType) ? { agentType: agentType as "SUPPORT" | "OPERATIONAL" } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, entries });
  } catch (error: any) {
    console.error("[GET /api/tenant/knowledge-base] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar base de conhecimento." }, { status: 500 });
  }
}

// POST /api/tenant/knowledge-base — salva uma pergunta+resposta como conhecimento reaproveitável.
// Nunca é gravado automaticamente pelo agente: é sempre uma ação explícita de um operador humano
// (ex: ao resolver uma conversa que o agente escalou), evitando poluir a base com respostas ruins.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const body = await req.json();
    const { title, category, question, resolution, agentType, sourceType } = body;

    if (!title || !category || !question || !resolution) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: title, category, question, resolution." },
        { status: 400 }
      );
    }

    const entry = await prisma.supportKnowledgeBase.create({
      data: {
        tenantId: session.tenantId,
        title,
        category,
        question,
        resolution,
        agentType: agentType === "OPERATIONAL" ? "OPERATIONAL" : "SUPPORT",
        sourceType: ["MANUAL", "HUMAN_CORRECTION", "ESCALATION_RESOLVED"].includes(sourceType) ? sourceType : "HUMAN_CORRECTION",
        verified: true,
      },
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    console.error("[POST /api/tenant/knowledge-base] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar conhecimento." }, { status: 500 });
  }
}
