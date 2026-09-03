import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateTerminalToken } from "@/lib/pdvTerminalToken";

// POST /api/pdv/terminais/[id]/token — regenera o token de autenticação do agente de um caixa.
// Incrementa tokenVersion, o que invalida imediatamente o token anterior (o agente antigo para
// de autenticar até ser reconfigurado). O novo token em claro só aparece nesta resposta.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;

    const { token, tokenHash } = generateTerminalToken();

    const updated = await prisma.pdvTerminal.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: { apiTokenHash: tokenHash, tokenVersion: { increment: 1 } },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Caixa não encontrado." }, { status: 404 });
    }

    await logActivity({
      tenantId: session!.tenantId!,
      userId: session!.userId,
      userName: session!.name,
      action: "PDV_TERMINAL_TOKEN_REGENERATE",
      description: `${session!.name} regenerou o token de acesso do agente fiscal de um caixa.`,
      entityType: "PDV_TERMINAL",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, token });
  } catch (error: any) {
    console.error("[POST /api/pdv/terminais/[id]/token] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
