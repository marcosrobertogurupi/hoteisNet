import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasValidBearerSecret } from "@/lib/bearerSecret";
import { runDailyRolloverCatchUp, DAILY_CATCHUP_ACTION } from "@/lib/dailyRollover";

// GET /api/cron/diarias — ROTA SEM SESSÃO, chamada pelo Vercel Cron (vercel.json), autenticada por
// `Authorization: Bearer CRON_SECRET` (a Vercel envia esse cabeçalho sozinha quando a env existe).
//
// Rede de segurança da virada de diária independente da Railway: 1x ao dia varre TODOS os hotéis e
// lança as diárias que o worker não lançou. Com o worker no ar, não encontra nada. Quando precisa
// lançar algo, registra na trilha da plataforma (DAILY_CATCHUP_ACTION) — o Eugênio lê isso em
// /api/platform-health/diarias e avisa a equipe de suporte do SaaS (nunca a equipe do hotel).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!hasValidBearerSecret(req, "CRON_SECRET")) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  const launches = await runDailyRolloverCatchUp();

  if (launches.length > 0) {
    const byTenant = new Map<string, typeof launches>();
    for (const l of launches) byTenant.set(l.tenantId, [...(byTenant.get(l.tenantId) || []), l]);
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [...byTenant.keys()] } },
      select: { id: true, name: true, tradeName: true },
    });
    const nome = new Map(tenants.map((t) => [t.id, t.tradeName || t.name]));

    await prisma.platformAuditLog.createMany({
      data: [...byTenant.entries()].map(([tenantId, items]) => {
        const dias = items.reduce((s, i) => s + i.daysAdded, 0);
        return {
          actorId: "cron-diarias",
          actorName: "Rede de segurança das diárias",
          actorRole: "SYSTEM",
          action: DAILY_CATCHUP_ACTION,
          description: `${nome.get(tenantId) || tenantId}: ${dias} diária(s) lançada(s) pela rede de segurança em ${items.length} quarto(s) (${items.map((i) => i.roomNumber).join(", ")}) — o worker não lançou.`,
          targetTenantId: tenantId,
          entityType: "Tenant",
          entityId: tenantId,
          details: { quartos: items.map((i) => ({ quarto: i.roomNumber, dias: i.daysAdded })) },
        };
      }),
    });
    console.error(`[cron/diarias] rede de segurança lançou diárias em ${launches.length} hospedagem(ns) — worker falhou.`);
  }

  return NextResponse.json({ success: true, hospedagensRecuperadas: launches.length });
}
