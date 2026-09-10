import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

// Meses (AAAA-MM, fuso de São Paulo) do mês atual até `count` meses atrás.
function recentMonths(count: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(fmt.format(d).slice(0, 7)); // "AAAA-MM"
  }
  return out;
}

// GET /api/admin/ai-cost-reconciliation — por mês: custo calculado pelo sistema (Σ totalCostUsd),
// fatura real informada e desvio. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const months = recentMonths(6);

  const [computedRows, entries] = await Promise.all([
    // Custo calculado por mês (fuso de São Paulo) a partir dos registros de uso.
    prisma.$queryRawUnsafe<{ month: string; cost: number; tokens: bigint; requests: bigint }[]>(
      `SELECT to_char("createdAt" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
              COALESCE(SUM("totalCostUsd"), 0)::float8 AS cost,
              COALESCE(SUM("tokensInput" + "tokensOutput"), 0) AS tokens,
              COUNT(*) AS requests
       FROM public.ai_usage_logs
       WHERE "createdAt" >= now() - interval '7 months'
       GROUP BY 1`
    ),
    prisma.aiCostReconciliation.findMany({ where: { periodMonth: { in: months } } }),
  ]);

  const computedByMonth = new Map(computedRows.map((r) => [r.month, r]));
  const entryByMonth = new Map(entries.map((e) => [e.periodMonth, e]));

  const rows = months.map((month) => {
    const computed = computedByMonth.get(month);
    const entry = entryByMonth.get(month);
    const computedUsd = computed ? Math.round(computed.cost * 1e6) / 1e6 : 0;
    const invoiceUsd = entry ? Number(entry.providerInvoiceUsd) : null;
    const driftUsd = invoiceUsd != null ? Math.round((computedUsd - invoiceUsd) * 1e6) / 1e6 : null;
    const driftPct =
      invoiceUsd != null && invoiceUsd > 0 ? Math.round(((computedUsd - invoiceUsd) / invoiceUsd) * 1000) / 10 : null;
    return {
      month,
      computedUsd,
      tokens: computed ? Number(computed.tokens) : 0,
      requests: computed ? Number(computed.requests) : 0,
      invoiceUsd,
      driftUsd,
      driftPct,
      note: entry?.note ?? null,
      enteredByName: entry?.enteredByName ?? null,
      updatedAt: entry?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ success: true, rows });
}

// PATCH /api/admin/ai-cost-reconciliation — grava/atualiza a fatura real de um mês.
// body: { periodMonth: "AAAA-MM", providerInvoiceUsd: number, note?: string }
// providerInvoiceUsd null/"" remove a entrada. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const periodMonth = String(body.periodMonth || "");
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    return NextResponse.json({ success: false, error: "Mês inválido (use AAAA-MM)." }, { status: 400 });
  }

  const raw = body.providerInvoiceUsd;
  if (raw === null || raw === "" || raw === undefined) {
    await prisma.aiCostReconciliation.deleteMany({ where: { periodMonth } });
    await logPlatformAction({
      req,
      session: session!,
      action: "AI_COST_RECONCILIATION_CLEAR",
      description: `Reconciliação de IA de ${periodMonth} removida.`,
      entityType: "AiCostReconciliation",
      entityId: periodMonth,
    });
    return NextResponse.json({ success: true, periodMonth, providerInvoiceUsd: null });
  }

  const invoice = Number(raw);
  if (!Number.isFinite(invoice) || invoice < 0) {
    return NextResponse.json({ success: false, error: "Valor da fatura inválido." }, { status: 400 });
  }
  const note = String(body.note || "").trim() || null;

  await prisma.aiCostReconciliation.upsert({
    where: { periodMonth },
    create: {
      periodMonth,
      providerInvoiceUsd: Math.round(invoice * 10000) / 10000,
      note,
      enteredByName: session!.name,
    },
    update: { providerInvoiceUsd: Math.round(invoice * 10000) / 10000, note, enteredByName: session!.name },
  });

  await logPlatformAction({
    req,
    session: session!,
    action: "AI_COST_RECONCILIATION_SET",
    description: `Fatura real de IA de ${periodMonth}: US$ ${invoice.toFixed(2)}.`,
    entityType: "AiCostReconciliation",
    entityId: periodMonth,
    details: { periodMonth, providerInvoiceUsd: invoice },
  });

  return NextResponse.json({ success: true, periodMonth, providerInvoiceUsd: invoice });
}
