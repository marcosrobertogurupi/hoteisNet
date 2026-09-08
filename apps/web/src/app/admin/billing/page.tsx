"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, TrendingUp, AlertTriangle, Loader2, Plus, X, Check, ExternalLink, CheckCircle2, Ban, Undo2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

const brl = (v: number | string | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Em aberto", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  CONFIRMED: { label: "Confirmado", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  RECEIVED: { label: "Recebido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  OVERDUE: { label: "Vencido", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  REFUNDED: { label: "Estornado", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  CHARGEBACK: { label: "Chargeback", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  CANCELLED: { label: "Cancelado", cls: "bg-slate-100 text-slate-400 border-slate-200" },
};
const TENANT_STATUS_LABEL: Record<string, string> = {
  TRIAL: "Degustação", ACTIVE: "Ativos", OVERDUE: "Inadimplentes", SUSPENDED: "Suspensos", CANCELLED: "Cancelados",
};

interface Summary {
  asaasConfigured: boolean;
  mrr: number;
  arr: number;
  tenantsByStatus: Record<string, number>;
  openInvoicesCount: number;
  pendingAmount: number;
  overdueAmount: number;
  upcomingBillings30d: number;
}
interface Invoice {
  id: string;
  tenantId: string;
  tenantName: string;
  cycle: string;
  amount: string;
  billingType: string | null;
  status: string;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  manual: boolean;
  description: string | null;
}
interface TenantOpt { id: string; name: string; tradeName: string | null; }

export default function AdminBillingPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [canEdit, setCanEdit] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [tenantOpts, setTenantOpts] = useState<TenantOpt[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ tenantId: "", amount: "", dueDate: "", billingType: "UNDEFINED", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => { if (d?.success) setCanEdit(!!d.user.canEdit); }).catch(() => {});
    fetch("/api/admin/billing").then((r) => r.json()).then((d) => { if (d?.success) setSummary(d); }).catch(() => {});
    fetch("/api/admin/tenants?pageSize=100").then((r) => r.json()).then((d) => {
      if (d?.success) setTenantOpts(d.tenants.map((t: any) => ({ id: t.id, name: t.name, tradeName: t.tradeName })));
    }).catch(() => {});
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/invoices?${params}`);
      const data = await res.json();
      if (data?.success) { setInvoices(data.invoices); setTotal(data.total); }
      else toast.error(data?.error || "Erro ao carregar faturas.");
    } catch {
      toast.error("Falha de rede ao carregar faturas.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, toast]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const refreshAll = async () => {
    const s = await fetch("/api/admin/billing").then((r) => r.json()).catch(() => null);
    if (s?.success) setSummary(s);
    await loadInvoices();
  };

  const invoiceAction = async (inv: Invoice, action: "markPaid" | "cancel" | "refund") => {
    const labels = { markPaid: "dar baixa manual", cancel: "cancelar", refund: "estornar" };
    const ok = await confirmDialog({
      title: `Confirmar: ${labels[action]}`,
      message: `Fatura de ${inv.tenantName} — ${brl(inv.amount)}. ${
        action === "markPaid" ? "O acesso do assinante será estendido pelo ciclo." : action === "refund" ? "Se houver pagamento no Asaas, ele será estornado." : "A fatura ficará cancelada."
      }`,
      confirmLabel: "Confirmar",
      ...(action === "markPaid" ? {} : { variant: "danger" as const }),
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (data?.success) { toast.success("Feito."); await refreshAll(); }
    else toast.error(data?.error || "Não foi possível concluir.");
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tenantId || !form.amount) { toast.warning("Escolha o assinante e informe o valor."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${form.tenantId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          dueDate: form.dueDate || undefined,
          billingType: form.billingType,
          description: form.description,
        }),
      });
      const data = await res.json();
      if (!data?.success) { toast.error(data?.error || "Não foi possível gerar a cobrança."); return; }
      toast.success(data.mode === "asaas" ? "Cobrança gerada no Asaas." : "Cobrança avulsa registrada (manual).");
      setModalOpen(false);
      setForm({ tenantId: "", amount: "", dueDate: "", billingType: "UNDEFINED", description: "" });
      await refreshAll();
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 25));
  const input = c.field;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Financeiro</h1>
            <p className={c.subtitle}>
              Receita recorrente, inadimplência e faturas dos assinantes.
              {summary && !summary.asaasConfigured && " Asaas não configurado — cobranças são manuais."}
            </p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setModalOpen(true)} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition">
            <Plus className="w-4 h-4" /> Cobrança avulsa
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="MRR" value={brl(summary?.mrr)} sub="receita recorrente / mês" icon={<TrendingUp className="w-5 h-5" />} tone="emerald" />
        <Card title="ARR" value={brl(summary?.arr)} sub="projeção anual" icon={<DollarSign className="w-5 h-5" />} tone="sky" />
        <Card title="Inadimplência" value={brl(summary?.overdueAmount)} sub={`${summary?.openInvoicesCount ?? 0} fatura(s) em aberto`} icon={<AlertTriangle className="w-5 h-5" />} tone="amber" />
        <Card title="Próximas 30 dias" value={String(summary?.upcomingBillings30d ?? 0)} sub="assinaturas a renovar" icon={<DollarSign className="w-5 h-5" />} tone="slate" />
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.tenantsByStatus).map(([k, n]) => (
            <span key={k} className="text-xs px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
              {TENANT_STATUS_LABEL[k] || k}: <b className="text-slate-900">{n}</b>
            </span>
          ))}
        </div>
      )}

      <div className={c.tableCard}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Faturas</h3>
          <select value={statusFilter} onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }} className={`${input} py-1.5 w-44`}>
            <option value="">Todos os status</option>
            {Object.entries(INV_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3">Assinante</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Ciclo</th>
                <th className="px-5 py-3">Vencimento</th>
                <th className="px-5 py-3">Pago em</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} className={`px-5 py-12 text-center ${c.empty}`}>Nenhuma fatura.</td></tr>
              ) : invoices.map((inv) => {
                const sm = INV_STATUS[inv.status] || INV_STATUS.PENDING;
                const settled = ["RECEIVED", "CONFIRMED", "REFUNDED", "CANCELLED"].includes(inv.status);
                return (
                  <tr key={inv.id} className={`transition ${c.rowHover}`}>
                    <td className="px-5 py-3.5">
                      <span className={`font-semibold ${c.strong}`}>{inv.tenantName}</span>
                      {inv.description && <span className="block text-[11px] text-slate-500">{inv.description}{inv.manual ? " · manual" : ""}</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-700">{brl(inv.amount)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{inv.cycle === "ANNUAL" ? "Anual" : inv.cycle === "SEMIANNUAL" ? "Semestral" : "Mensal"}</td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(inv.dueDate)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(inv.paidAt)}</td>
                    <td className="px-5 py-3.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sm.cls}`}>{sm.label}</span></td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.invoiceUrl && (
                          <a href={inv.invoiceUrl} target="_blank" rel="noreferrer" title="Abrir fatura no Asaas" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><ExternalLink className="w-4 h-4" /></a>
                        )}
                        {canEdit && !settled && (
                          <>
                            <button onClick={() => invoiceAction(inv, "markPaid")} title="Dar baixa manual" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-emerald-600 hover:text-white transition"><CheckCircle2 className="w-4 h-4" /></button>
                            <button onClick={() => invoiceAction(inv, "cancel")} title="Cancelar" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white transition"><Ban className="w-4 h-4" /></button>
                          </>
                        )}
                        {canEdit && (inv.status === "RECEIVED" || inv.status === "CONFIRMED") && (
                          <button onClick={() => invoiceAction(inv, "refund")} title="Estornar" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white transition"><Undo2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 text-xs text-slate-500">
          <span>{total} fatura(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={c.ghostBtn + " disabled:opacity-40"}>Anterior</button>
            <span className="font-mono">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={c.ghostBtn + " disabled:opacity-40"}>Próxima</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-5 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">Cobrança avulsa</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createInvoice} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={c.label}>Assinante <span className="text-rose-500">*</span></label>
                <select className={input} value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required>
                  <option value="">Selecione…</option>
                  {tenantOpts.map((t) => <option key={t.id} value={t.id}>{t.tradeName || t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Valor (R$) <span className="text-rose-500">*</span></label>
                  <input className={input} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Vencimento</label>
                  <input className={input} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Forma</label>
                <select className={input} value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })}>
                  <option value="UNDEFINED">Deixar o assinante escolher</option>
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="CREDIT_CARD">Cartão</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Descrição</label>
                <input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: implantação, treinamento, add-on" />
              </div>
              <div className={`pt-1 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setModalOpen(false)} className={c.ghostBtn}>Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Gerar cobrança
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, sub, icon, tone }: { title: string; value: string; sub: string; icon: React.ReactNode; tone: "emerald" | "sky" | "amber" | "slate" }) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    slate: "bg-slate-50 border-slate-200 text-slate-600",
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
