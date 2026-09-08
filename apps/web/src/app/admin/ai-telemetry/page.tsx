"use client";

import { useEffect, useState } from "react";
import { Cpu, Loader2, Database } from "lucide-react";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

const nfmt = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const mb = (b: number) => (b / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";

interface Feature { feature: string; requests: number; tokens: number; costUsd: number; }
interface PerTenant {
  tenantId: string; tenantName: string; blocked: boolean;
  tokensPeriod: number; costPeriodUsd: number; usedMonth: number; quota: number; pct: number; status: string;
}
interface Egress { tenantId: string; tenantName: string; bytes: number; queries: number; }

export default function AdminAiTelemetryPage() {
  const [days] = useState(30);
  const [byFeature, setByFeature] = useState<Feature[]>([]);
  const [perTenant, setPerTenant] = useState<PerTenant[]>([]);
  const [totals, setTotals] = useState({ tokens: 0, costUsd: 0 });
  const [egress, setEgress] = useState<Egress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/ai-usage?days=${days}`).then((r) => r.json()),
      fetch("/api/admin/dashboard").then((r) => r.json()),
    ])
      .then(([ai, dash]) => {
        if (ai?.success) { setByFeature(ai.byFeature); setPerTenant(ai.perTenant); setTotals(ai.totals); }
        if (dash?.success) setEgress(dash.egressTop30d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /> Carregando telemetria…</div>;

  const statusCls: Record<string, string> = {
    OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
    WARNING: "bg-amber-50 text-amber-700 border-amber-200",
    EXCEEDED: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-violet-50 border border-violet-200 text-violet-600 rounded-2xl"><Cpu className="w-7 h-7" /></div>
          <div>
            <h1 className={c.title}>Telemetria & IA</h1>
            <p className={c.subtitle}>Consumo de tokens e custo por recurso e por assinante (últimos {days} dias), e volume de dados por assinante.</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-slate-900 font-mono">{nfmt(totals.tokens)} tok</div>
          <div className="text-[11px] text-slate-400">custo {usd(totals.costUsd)} em {days} dias</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={`${c.tableCard} overflow-hidden`}>
          <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-semibold text-slate-900">Por recurso</h3></div>
          <table className="w-full text-xs">
            <thead className={c.thead}><tr><th className="px-4 py-2.5">Recurso</th><th className="px-4 py-2.5 text-right">Requisições</th><th className="px-4 py-2.5 text-right">Tokens</th><th className="px-4 py-2.5 text-right">Custo</th></tr></thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {byFeature.length === 0 ? (
                <tr><td colSpan={4} className={`px-4 py-10 text-center ${c.empty}`}>Sem uso no período.</td></tr>
              ) : byFeature.map((f) => (
                <tr key={f.feature}>
                  <td className="px-4 py-2.5 text-slate-700">{f.feature}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{nfmt(f.requests)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{nfmt(f.tokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{usd(f.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`${c.tableCard} overflow-hidden`}>
          <div className="p-4 border-b border-slate-200 flex items-center gap-2"><Database className="w-4 h-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-900">Volume de dados por assinante (30 dias)</h3></div>
          <table className="w-full text-xs">
            <thead className={c.thead}><tr><th className="px-4 py-2.5">Assinante</th><th className="px-4 py-2.5 text-right">Consultas</th><th className="px-4 py-2.5 text-right">Volume</th></tr></thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {egress.length === 0 ? (
                <tr><td colSpan={3} className={`px-4 py-10 text-center ${c.empty}`}>Ainda coletando.</td></tr>
              ) : egress.map((e) => (
                <tr key={e.tenantId}>
                  <td className="px-4 py-2.5 text-slate-700">{e.tenantName}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{nfmt(e.queries)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{mb(e.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-semibold text-slate-900">Cota de IA por assinante (uso no mês corrente)</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-4 py-2.5">Assinante</th>
                <th className="px-4 py-2.5 text-right">Tokens ({days}d)</th>
                <th className="px-4 py-2.5 text-right">Custo ({days}d)</th>
                <th className="px-4 py-2.5 text-right">Uso no mês</th>
                <th className="px-4 py-2.5 text-right">Cota</th>
                <th className="px-4 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {perTenant.length === 0 ? (
                <tr><td colSpan={6} className={`px-4 py-10 text-center ${c.empty}`}>Nenhum assinante com uso de IA.</td></tr>
              ) : perTenant.map((t) => (
                <tr key={t.tenantId}>
                  <td className="px-4 py-2.5 text-slate-800 font-semibold">
                    {t.tenantName} {t.blocked && <span className="ml-1 text-[10px] text-rose-600">(IA bloqueada)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{nfmt(t.tokensPeriod)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{usd(t.costPeriodUsd)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{nfmt(t.usedMonth)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">{nfmt(t.quota)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls[t.status]}`}>{t.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
