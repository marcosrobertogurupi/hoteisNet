import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/agent-actions — lista as ações que os agentes de IA (atendimento + operacional)
// já tomaram para este tenant, reaproveitando o AuditLog geral (convenção: toda ação de agente
// grava com action prefixado "AGENT_" e userName "Agente de IA" — ver apps/web/src/lib/aiAgent/
// tools.ts e apps/worker/src/operationalAgent.ts). Sem tabela nova, só um filtro.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const actions = await prisma.auditLog.findMany({
      where: { tenantId: session.tenantId, action: { startsWith: "AGENT_" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, actions });
  } catch (error: any) {
    console.error("[GET /api/tenant/agent-actions] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar ações do agente." }, { status: 500 });
  }
}
