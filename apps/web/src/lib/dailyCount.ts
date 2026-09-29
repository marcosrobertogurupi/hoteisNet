import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { normalizeDailyRules, type DailyCountRules } from "@/lib/dailyCountCore";

// Lado servidor da contagem de diárias: busca as regras do hotel no banco. A contagem em si
// (countDailies & cia.) é pura e vive em lib/dailyCountCore.ts, para as telas usarem a MESMA regra
// sem importar prisma — ver a explicação completa da regra lá.
export {
  countDailies,
  countDailiesBreakdown,
  countStayDailies,
  rolloverInstant,
  normalizeDailyRules,
  DEFAULT_DAILY_RULES,
  type DailyCountRules,
  type DailyCountBreakdown,
} from "@/lib/dailyCountCore";

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export async function getTenantDailyRules(tx: PrismaClientOrTx, tenantId: string): Promise<DailyCountRules> {
  const t = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { standardCheckInTime: true, earlyCheckinToleranceMinutes: true, dailyRolloverTime: true },
  });
  return normalizeDailyRules(t);
}
