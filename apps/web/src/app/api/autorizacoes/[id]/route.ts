import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { expireIfStale } from "@/lib/criticalAuth";

// GET /api/autorizacoes/[id] — status da solicitação, consultado pela janela de espera enquanto
// ela está aberta. Resposta mínima (só o que muda) — é chamada em loop curto (CLAUDE.md ⚡ §5).
// Só quem pediu enxerga a própria solicitação.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const { id } = await params;
  await expireIfStale(session.tenantId, id);
  const row = await prisma.criticalAuthorization.findFirst({
    where: { id, tenantId: session.tenantId, requestedById: session.userId },
    select: { status: true, decidedByName: true, decisionNote: true },
  });
  if (!row) return NextResponse.json({ success: false, error: "Solicitação não encontrada." }, { status: 404 });
  return NextResponse.json({
    success: true,
    status: row.status,
    decididoPor: row.decidedByName,
    observacao: row.decisionNote,
  });
}
