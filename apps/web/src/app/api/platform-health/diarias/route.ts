import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasValidBearerSecret } from "@/lib/bearerSecret";
import { auditOpenStayDailies } from "@/lib/dailyAudit";
import { DAILY_CATCHUP_ACTION } from "@/lib/dailyRollover";

// GET /api/platform-health/diarias — ROTA SEM SESSÃO, autenticada pelo mesmo segredo de
// /api/platform-health (PLATFORM_HEALTH_TOKEN, Bearer, timing-safe).
//
// Consultada pelo Eugênio (assistente do dono, repo AssistentePessoal) a cada 15 min: se houver
// problema nas diárias, ele avisa a equipe de suporte do SaaS no WhatsApp. NUNCA avisa a equipe do
// hotel — por isso isto não passa pelo agente operacional (que fala com o hotel e roda no worker da
// Railway, o mesmo processo que pode estar parado).
//
// Resposta enxuta (é consultada em intervalo): só as hospedagens com problema (hotel, quarto, id) e
// as recuperações feitas pelo cron nas últimas 24h. Nenhum dado de hóspede.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!hasValidBearerSecret(req, "PLATFORM_HEALTH_TOKEN")) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [problemas, recuperacoes] = await Promise.all([
    auditOpenStayDailies(),
    prisma.platformAuditLog.findMany({
      where: { action: DAILY_CATCHUP_ACTION, createdAt: { gte: since24h } },
      select: { createdAt: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    success: true,
    geradoEm: new Date().toISOString(),
    ok: problemas.length === 0,
    problemas: problemas.map((p) => ({
      hotel: p.hotel,
      quarto: p.quarto,
      hospedagemId: p.hospedagemId,
      problemas: p.problemas,
      ultimaVirada: p.ultimaVirada,
      diariasContadas: p.diariasContadas,
      diariasLancadas: p.diariasLancadas,
    })),
    // Diárias que só foram lançadas pela rede de segurança da Vercel (= o worker falhou nelas).
    recuperadasPeloCron24h: recuperacoes.map((r) => ({ em: r.createdAt.toISOString(), resumo: r.description })),
  });
}
