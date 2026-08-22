import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/tenant/human-escalations?resolved=false — fila de "precisa de um humano agora",
// alimentada pelo Agente de Atendimento (escalate_to_human) e pelo Agente Operacional (worker).
// Usada pelo sino de alerta em apps/web/src/app/app/layout.tsx (Mapa de Quartos/Reservas).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resolvedParam = searchParams.get("resolved");
    const resolved = resolvedParam === null ? undefined : resolvedParam === "true";

    const escalations = await prisma.humanEscalation.findMany({
      where: { tenantId: session.tenantId, ...(resolved !== undefined ? { resolved } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, escalations, count: escalations.length });
  } catch (error: any) {
    console.error("[GET /api/tenant/human-escalations] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar escalações." }, { status: 500 });
  }
}
