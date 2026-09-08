"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, TrendingUp, Cpu, LifeBuoy, Database, AlertTriangle, Loader2, IdCard,
} from "lucide-react";
import { aiFeatureLabel } from "@/lib/aiFeatureLabels";

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const usd = (v: number | null | undefined) => (v == null ? "—" : `US$ ${Number(v).toFixed(2)}`);
const nfmt = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));
const mb = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB";

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Degustação", ACTIVE: "Ativos", OVERDUE: "Inadimplentes", SUSPENDED: "Suspensos", CANCELLED: "Cancelados",
};

interface Dashboard {
  mrr: number; arr: number;
  tenantsByStatus: Record<string, number>; tenantsTotal: number; newThisMonth: number;
  openTickets: number;
  ai30d: { tokens: number; costUsd: number; byFeature: { feature: string; tokens: number; costUsd: number }[] };
  cpf: { used: number; quota: number };
  egressTop30d: { tenantId: string; tenantName: string; bytes: number; queries: number }[];
}
interface Billing { overdueAmount: number; openInvoicesCount: number; upcomingBillings30d: number; asaasConfigured: boolean; }

export default function AdminOverviewPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [b, setB] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/dashboard").then((r) => r.json()),
      fetch("/api/admin/billing").then((r) => r.json()),
    ])
      .then(([dash, bill]) => {
        if (dash?.success) setD(dash);
        if (bill?.success) setB(bill);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /> Carregando visão geral…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat title="MRR" value={brl(d?.mrr)} sub="receita recorrente / mês" icon={<TrendingUp className="w-5 h-5" />} tone="emerald" />
        <Stat title="Assinantes" value={nfmt(d?.tenantsTotal)} sub={`+${d?.newThisMonth ?? 0} este mês`} icon={<Building2 className="w-5 h-5" />} tone="sky" />
        <Stat title="Inadimplência" value={brl(b?.overdueAmount)} sub={`${b?.openInvoicesCount ?? 0} fatura(s) em aberto`} icon={<AlertTriangle className="w-5 h-5" />} tone="amber" />
        <Stat title="IA — 30 dias" value={`${nfmt(d?.ai30d.tokens)} tok`} sub={`custo ${usd(d?.ai30d.costUsd)}`} icon={<Cpu className="w-5 h-5" />} tone="violet" />
      </div>

      <div className="flex flex-wrap gap-2">
        {d && Object.entries(d.tenantsByStatus).map(([k, n]) => (
          <Link key={k} href={`/admin/tenants?status=${k}`} className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-sky-300 transition">
            {STATUS_LABEL[k] || k}: <b className="text-slate-900">{n}</b>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Consumo de IA por recurso (30 dias)" icon={<Cpu className="w-4 h-4" />} href="/admin/ai-telemetry">
          {d && d.ai30d.byFeature.length > 0 ? (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {d.ai30d.byFeature.map((f) => (
                  <tr key={f.feature}>
                    <td className="py-2 text-slate-700">{aiFeatureLabel(f.feature).label}</td>
                    <td className="py-2 text-right font-mono text-slate-600">{nfmt(f.tokens)} tok</td>
                    <td className="py-2 text-right font-mono text-emerald-700 w-24">{usd(f.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>Nenhum uso de IA registrado nos últimos 30 dias.</Empty>}
        </Panel>

        <Panel title="Volume de dados por assinante (30 dias)" icon={<Database className="w-4 h-4" />} href="/admin/ai-telemetry">
          {d && d.egressTop30d.length > 0 ? (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {d.egressTop30d.map((e) => (
                  <tr key={e.tenantId}>
                    <td className="py-2 text-slate-700">{e.tenantName}</td>
                    <td className="py-2 text-right font-mono text-slate-500">{nfmt(e.queries)} consultas</td>
                    <td className="py-2 text-right font-mono text-slate-900 w-24">{mb(e.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>Ainda coletando dados de egress por assinante.</Empty>}
        </Panel>

        <Panel title="Consultas de CPF (Hub do Desenvolvedor)" icon={<IdCard className="w-4 h-4" />} href="/admin/settings">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-bold text-slate-900 font-mono">{nfmt(d?.cpf.used)}</div>
              <div className="text-[11px] text-slate-400">usadas este mês · cota total contratada {nfmt(d?.cpf.quota)}</div>
            </div>
            <div className="w-32 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-sky-500" style={{ width: `${d?.cpf.quota ? Math.min(100, (d.cpf.used / d.cpf.quota) * 100) : 0}%` }} />
            </div>
          </div>
        </Panel>

        <Panel title="Operação" icon={<LifeBuoy className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <MiniStat label="Tickets abertos" value={nfmt(d?.openTickets)} href="/admin/support" />
            <MiniStat label="Renovações em 30d" value={nfmt(b?.upcomingBillings30d)} href="/admin/billing" />
            <MiniStat label="ARR projetado" value={brl(d?.arr)} />
            <MiniStat label="Asaas" value={b?.asaasConfigured ? "configurado" : "manual"} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ title, value, sub, icon, tone }: { title: string; value: string; sub: string; icon: React.ReactNode; tone: "emerald" | "sky" | "amber" | "violet" }) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  }[tone];
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">{title}</span>
        <span className={`w-8 h-8 rounded-lg border flex items-center justify-center ${tones}`}>{icon}</span>
      </div>
      <div className="text-xl font-bold text-slate-900 mt-2 font-mono">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function Panel({ title, icon, href, children }: { title: string; icon: React.ReactNode; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">{icon} {title}</h3>
        {href && <Link href={href} className="text-[11px] font-semibold text-sky-700 hover:text-sky-900">ver mais →</Link>}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-400 py-4 text-center">{children}</p>;
}
