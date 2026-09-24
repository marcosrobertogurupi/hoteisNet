import { prisma } from "@/lib/prisma";

const MAX_TICKETS = 2000;

type StageKey = "OPEN" | "EVALUATING" | "WAITING";

// Relatório de tempo inativo dos quartos por manutenção: OS com ENTRADA no período [de, ateFim]
// (canceladas ficam fora do tempo inativo — foram abertas por engano). Agrega no servidor e
// devolve só os números e a lista enxuta que a tela desenha.
//  - Tempo inativo de OS resolvida = downtimeMinutes (entrada → retorno); de OS ainda aberta, o
//    tempo decorrido até `now` (marcada como "em aberto" na tela).
//  - Tempo por etapa sai da linha do tempo (MaintenanceTicketEvent): cada mudança de etapa fecha
//    o intervalo da etapa anterior; "Aguardando" é quebrado por motivo.
export async function buildMaintenanceReport(tenantId: string, de: Date, ateFim: Date, now: number = Date.now()) {
  const tickets = await prisma.maintenanceTicket.findMany({
    where: { tenantId, openedAt: { gte: de, lte: ateFim } },
    orderBy: { openedAt: "desc" },
    take: MAX_TICKETS,
    select: {
      id: true,
      number: true,
      stage: true,
      description: true,
      openedAt: true,
      resolvedAt: true,
      downtimeMinutes: true,
      room: { select: { number: true } },
      problemType: { select: { name: true } },
      assignedEmployee: { select: { name: true } },
      events: {
        where: { type: { in: ["OPENED", "STAGE_CHANGED", "CANCELLED"] } },
        orderBy: { createdAt: "asc" },
        select: { toStage: true, createdAt: true, waitReason: { select: { name: true } } },
      },
    },
  });

  const valid = tickets.filter((t) => t.stage !== "CANCELLED");
  const minutesOf = (t: (typeof tickets)[number]) =>
    t.stage === "RESOLVED" && t.downtimeMinutes !== null
      ? t.downtimeMinutes
      : Math.max(0, Math.round((now - t.openedAt.getTime()) / 60000));

  // Agregados por quarto / tipo de problema / colaborador.
  const group = (key: (t: (typeof tickets)[number]) => string) => {
    const map = new Map<string, { label: string; count: number; resolved: number; minutes: number; resolvedMinutes: number }>();
    for (const t of valid) {
      const k = key(t);
      const g = map.get(k) ?? { label: k, count: 0, resolved: 0, minutes: 0, resolvedMinutes: 0 };
      const m = minutesOf(t);
      g.count += 1;
      g.minutes += m;
      if (t.stage === "RESOLVED") {
        g.resolved += 1;
        g.resolvedMinutes += m;
      }
      map.set(k, g);
    }
    return [...map.values()]
      .map((g) => ({
        label: g.label,
        count: g.count,
        resolved: g.resolved,
        totalMinutes: g.minutes,
        avgResolvedMinutes: g.resolved > 0 ? Math.round(g.resolvedMinutes / g.resolved) : null,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  };

  // Tempo em cada etapa, a partir da linha do tempo.
  const stageTotals: Record<StageKey, { minutes: number; intervals: number }> = {
    OPEN: { minutes: 0, intervals: 0 },
    EVALUATING: { minutes: 0, intervals: 0 },
    WAITING: { minutes: 0, intervals: 0 },
  };
  const waitByReason = new Map<string, { minutes: number; intervals: number }>();
  for (const t of valid) {
    const evs = t.events.filter((e) => e.toStage);
    for (let i = 0; i < evs.length; i++) {
      const stage = evs[i].toStage as string;
      if (stage !== "OPEN" && stage !== "EVALUATING" && stage !== "WAITING") continue;
      const start = evs[i].createdAt.getTime();
      const end = i + 1 < evs.length ? evs[i + 1].createdAt.getTime() : t.stage === "RESOLVED" ? start : now;
      const minutes = Math.max(0, Math.round((end - start) / 60000));
      stageTotals[stage].minutes += minutes;
      stageTotals[stage].intervals += 1;
      if (stage === "WAITING") {
        const reason = evs[i].waitReason?.name || "Sem motivo";
        const w = waitByReason.get(reason) ?? { minutes: 0, intervals: 0 };
        w.minutes += minutes;
        w.intervals += 1;
        waitByReason.set(reason, w);
      }
    }
  }

  const resolved = valid.filter((t) => t.stage === "RESOLVED");
  const totalMinutes = valid.reduce((acc, t) => acc + minutesOf(t), 0);
  const resolvedMinutes = resolved.reduce((acc, t) => acc + minutesOf(t), 0);

  return {
    periodo: { de, ate: ateFim },
    truncated: tickets.length >= MAX_TICKETS,
    totals: {
      opened: valid.length,
      resolved: resolved.length,
      stillOpen: valid.length - resolved.length,
      cancelled: tickets.length - valid.length,
      roomsAffected: new Set(valid.map((t) => t.room.number)).size,
      totalMinutes,
      avgResolvedMinutes: resolved.length > 0 ? Math.round(resolvedMinutes / resolved.length) : null,
    },
    byRoom: group((t) => t.room.number),
    byProblemType: group((t) => t.problemType.name),
    byEmployee: group((t) => t.assignedEmployee.name),
    byStage: (["OPEN", "EVALUATING", "WAITING"] as StageKey[]).map((s) => ({
      stage: s,
      totalMinutes: stageTotals[s].minutes,
      avgMinutes: stageTotals[s].intervals > 0 ? Math.round(stageTotals[s].minutes / stageTotals[s].intervals) : null,
    })),
    waitByReason: [...waitByReason.entries()]
      .map(([label, w]) => ({ label, totalMinutes: w.minutes, avgMinutes: Math.round(w.minutes / w.intervals), count: w.intervals }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes),
    tickets: tickets.map((t) => ({
      id: t.id,
      number: t.number,
      stage: t.stage,
      roomNumber: t.room.number,
      problemType: t.problemType.name,
      description: t.description,
      employeeName: t.assignedEmployee.name,
      openedAt: t.openedAt,
      resolvedAt: t.resolvedAt,
      minutes: t.stage === "CANCELLED" ? null : minutesOf(t),
    })),
  };
}
