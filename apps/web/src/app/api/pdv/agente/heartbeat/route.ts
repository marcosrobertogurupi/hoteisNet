import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentContext } from "@/lib/agentAuth";

// POST /api/pdv/agente/heartbeat — o agente reporta que está vivo e manda diagnóstico:
//  { versao?, statusSefaz?, certificadoValidoAte?, certificadoTitular? }
// Devolve a versão mínima do agente exigida (para o próprio agente decidir se precisa se
// atualizar — o mecanismo de auto-update é da Fase 6).
export async function POST(req: NextRequest) {
  const ctx = await getAgentContext(req);
  if (!ctx) return NextResponse.json({ success: false, error: "Token do caixa inválido." }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));

    await prisma.pdvTerminal.update({
      where: { id: ctx.terminalId },
      data: {
        lastHeartbeat: new Date(),
        agentVersion: body.versao ? String(body.versao).slice(0, 40) : undefined,
        sefazStatus: body.statusSefaz ? String(body.statusSefaz).slice(0, 60) : undefined,
      },
    });

    if (body.certificadoValidoAte || body.certificadoTitular) {
      await prisma.fiscalConfig.updateMany({
        where: { tenantId: ctx.tenantId },
        data: {
          certificateExpiresAt: body.certificadoValidoAte ? new Date(body.certificadoValidoAte) : undefined,
          certificateHolder: body.certificadoTitular ? String(body.certificadoTitular).slice(0, 200) : undefined,
        },
      });
    }

    return NextResponse.json({
      success: true,
      versaoMinimaAgente: process.env.PDV_AGENT_MIN_VERSION || null,
      pollIntervalSegundos: 5,
    });
  } catch (error: any) {
    console.error("[POST /api/pdv/agente/heartbeat] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
