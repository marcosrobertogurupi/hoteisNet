"use client";

import { useEffect, useState } from "react";
import { Cpu, Loader2, Database, DollarSign } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";
import { aiFeatureLabel } from "@/lib/aiFeatureLabels";
import ReconciliationCard from "./ReconciliationCard";

const c = cadastroUI(false);

const nfmt = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mb = (b: number) => (b / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";

interface Feature { feature: string; requests: number; tokens: number; costUsd: number; models?: { model: string; tokens: number }[]; }
interface PerTenant {
  tenantId: string; tenantName: string; blocked: boolean;
  tokensPeriod: number; costPeriodUsd: number; costPeriodBrl: number; pricePeriodBrl: number; marginPeriodBrl: number;
  usedMonth: number; quota: number; pct: number; status: string;
}
interface Egress { tenantId: string; tenantName: string; bytes: number; queries: number; }
interface BillingConfig { usdToBrlRate: number; markupPct: number; rateUpdatedAt: string | null; updatedByName: string | null; }
interface Totals { tokens: number; costUsd: number; costBrl: number; priceBrl: number; marginBrl: number; }

const EMPTY_TOTALS: Totals = { tokens: 0, costUsd: 0, costBrl: 0, priceBrl: 0, marginBrl: 0 };

export default function AdminAiTelemetryPage() {
  const toast = useToast();
  const [days] = useState(30);
  const [byFeature, setByFeature] = useState<Feature[]>([]);
  const [perTenant, setPerTenant] = useState<PerTenant[]>([]);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [egress, setEgress] = useState<Egress[]>([]);
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);

  const [rateDraft, setRateDraft] = useState("");
  const [markupDraft, setMarkupDraft] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);

  const load = () => {
    Promise.all([
      fetch(`/api/admin/ai-usage?days=${days}`).then((r) => r.json()),
      fetch("/api/admin/dashboard").then((r) => r.json()),
      fetch("/api/admin/auth/me").then((r) => r.json()),
    ])
      .then(([ai, dash, me]) => {
        if (ai?.success) {
          setByFeature(ai.byFeature);
          setPerTenant(ai.perTenant);
          setTotals(ai.totals);
          setBilling(ai.billingConfig);
          setRateDraft(String(ai.billingConfig.usdToBrlRate));
          setMarkupDraft(String(ai.billingConfig.markupPct));
        }
        if (dash?.success) setEgress(dash.egressTop30d);
        if (me?.success) setCanEdit(!!me.user.canEdit);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [days]);

  const saveConfig = async () => {
    setSavingCfg(true);
    try {
      const res = await fetch("/api/admin/ai-billing-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdToBrlRate: Number(rateDraft), markupPct: Math.round(Number(markupDraft)) }),
      });
      const j = await res.json();
      if (j?.success) {
        toast.success("Faturamento de IA atualizado.");
        load();
      } else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingCfg(false);
    }
  };

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
            <p className={c.subtitle}>Consumo, custo real e preço faturável de IA por recurso e por assinante (últimos {days} dias).</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-slate-900 font-mono">{nfmt(totals.tokens)} tok</div>
          <div className="text-[11px] text-slate-400">custo {usd(totals.costUsd)} · preço {brl(totals.priceBrl)} em {days} dias</div>
        </div>
      </div>

      {/* Faturamento de IA — câmbio + margem + resumo custo/preço/margem */}
      <div className={`${c.tableCard} p-5`}>
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-900">Faturamento de IA (revendido ao assinante)</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">
          O custo em US$ é o que o Google cobra pelo consumo. O preço faturável aplica o câmbio e a margem abaixo.
          Nunca exibido ao assinante.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={c.label}>Câmbio USD → BRL</label>
            <input type="number" step="0.01" min="0" value={rateDraft} disabled={!canEdit}
              onChange={(e) => setRateDraft(e.target.value)} className={`${c.field} w-28`} />
          </div>
          <div>
            <label className={c.label}>Margem sobre o custo (%)</label>
            <input type="number" step="1" min="0" value={markupDraft} disabled={!canEdit}
              onChange={(e) => setMarkupDraft(e.target.value)} className={`${c.field} w-28`} />
          </div>
          {canEdit && (
            <button onClick={saveConfig} disabled={savingCfg}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50">
              {savingCfg ? "Salvando…" : "Salvar"}
            </button>
          )}
          {billing?.rateUpdatedAt && (
            <span className="text-[10px] text-slate-400">
              câmbio atualizado em {new Date(billing.rateUpdatedAt).toLocaleDateString("pt-BR")}
              {billing.updatedByName ? ` por ${billing.updatedByName}` : ""}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Kpi label={`Custo real (${days}d)`} value={usd(totals.costUsd)} sub={brl(totals.costBrl)} tone="slate" />
          <Kpi label={`Preço faturável (${days}d)`} value={brl(totals.priceBrl)} tone="sky" />
          <Kpi label={`Margem (${days}d)`} value={brl(totals.marginBrl)} tone="emerald" />
          <Kpi label="Câmbio · margem" value={`R$ ${billing?.usdToBrlRate.toFixed(2)} · ${billing?.markupPct}%`} tone="slate" />
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
              ) : byFeature.map((f) => {
                const meta = aiFeatureLabel(f.feature);
                return (
                <tr key={f.feature}>
                  <td className="px-4 py-2.5 text-slate-700">
                    <div className="font-medium text-slate-800">{meta.label}</div>
                    {meta.description && <div className="text-[11px] text-slate-400 mt-0.5 max-w-xs">{meta.description}</div>}
                    {f.models && f.models.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1 font-mono">{f.models.map((m) => m.model).join(" · ")}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{nfmt(f.requests)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{nfmt(f.tokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{usd(f.costUsd)}</td>
                </tr>
                );
              })}
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
        <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-semibold text-slate-900">Consumo, custo e preço faturável por assinante</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-4 py-2.5">Assinante</th>
                <th className="px-4 py-2.5 text-right">Tokens ({days}d)</th>
                <th className="px-4 py-2.5 text-right">Custo US$</th>
                <th className="px-4 py-2.5 text-right">Custo R$</th>
                <th className="px-4 py-2.5 text-right">Preço faturável R$</th>
                <th className="px-4 py-2.5 text-right">Margem R$</th>
                <th className="px-4 py-2.5 text-right">Uso no mês</th>
                <th className="px-4 py-2.5">Cota</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {perTenant.length === 0 ? (
                <tr><td colSpan={8} className={`px-4 py-10 text-center ${c.empty}`}>Nenhum assinante com uso de IA.</td></tr>
              ) : perTenant.map((t) => (
                <tr key={t.tenantId}>
                  <td className="px-4 py-2.5 text-slate-800 font-semibold">
                    {t.tenantName} {t.blocked && <span className="ml-1 text-[10px] text-rose-600">(IA bloqueada)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">{nfmt(t.tokensPeriod)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">{usd(t.costPeriodUsd)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700">{brl(t.costPeriodBrl)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sky-700 font-semibold">{brl(t.pricePeriodBrl)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">{brl(t.marginPeriodBrl)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{nfmt(t.usedMonth)} / {nfmt(t.quota)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCls[t.status]}`}>{t.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReconciliationCard canEdit={canEdit} />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "slate" | "sky" | "emerald" }) {
  const toneCls = {
    slate: "bg-slate-50 border-slate-200 text-slate-900",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-3 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-bold font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[11px] opacity-60 font-mono">{sub}</div>}
    </div>
  );
}
