"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, Plus, X, Check, Loader2, Pencil, Trash2, Power } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceSemiannual: string | null;
  priceAnnual: string | null;
  maxRooms: number;
  maxUsers: number;
  aiTokenQuota: number;
  features: string[];
  trialDays: number;
  active: boolean;
  _count: { subscriptions: number };
}

interface FormState {
  name: string;
  description: string;
  priceMonthly: string;
  priceSemiannual: string;
  priceAnnual: string;
  maxRooms: string;
  maxUsers: string;
  aiTokenQuota: string;
  trialDays: string;
  features: string;
  active: boolean;
}

const EMPTY: FormState = {
  name: "", description: "", priceMonthly: "", priceSemiannual: "", priceAnnual: "",
  maxRooms: "0", maxUsers: "0", aiTokenQuota: "50000", trialDays: "0", features: "", active: true,
};

const brl = (v: string | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AdminPlansPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [canEdit, setCanEdit] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; id: string }>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => {
      if (d?.success) setCanEdit(!!d.user.canEdit);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/plans?active=0");
      const data = await res.json();
      if (data?.success) setPlans(data.plans);
      else toast.error(data?.error || "Erro ao carregar planos.");
    } catch {
      toast.error("Falha de rede ao carregar planos.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY });
    setModal({ mode: "create" });
  };

  const openEdit = (p: Plan) => {
    setForm({
      name: p.name,
      description: p.description || "",
      priceMonthly: String(p.priceMonthly),
      priceSemiannual: p.priceSemiannual != null ? String(p.priceSemiannual) : "",
      priceAnnual: p.priceAnnual != null ? String(p.priceAnnual) : "",
      maxRooms: String(p.maxRooms),
      maxUsers: String(p.maxUsers),
      aiTokenQuota: String(p.aiTokenQuota),
      trialDays: String(p.trialDays),
      features: p.features.join("\n"),
      active: p.active,
    });
    setModal({ mode: "edit", id: p.id });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !modal) return;
    setSaving(true);
    try {
      const isCreate = modal.mode === "create";
      const payload = {
        name: form.name,
        description: form.description,
        priceMonthly: form.priceMonthly,
        priceSemiannual: form.priceSemiannual,
        priceAnnual: form.priceAnnual,
        maxRooms: Number(form.maxRooms),
        maxUsers: Number(form.maxUsers),
        aiTokenQuota: Number(form.aiTokenQuota),
        trialDays: Number(form.trialDays),
        features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
        active: form.active,
      };
      const res = await fetch(isCreate ? "/api/admin/plans" : `/api/admin/plans/${modal.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || "Não foi possível salvar.");
        return;
      }
      toast.success(isCreate ? "Plano criado." : "Plano atualizado.");
      setModal(null);
      await load();
    } catch {
      toast.error("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Plan) => {
    const res = await fetch(`/api/admin/plans/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    const data = await res.json();
    if (data?.success) {
      toast.success(p.active ? "Plano desativado." : "Plano reativado.");
      await load();
    } else toast.error(data?.error || "Erro ao alterar situação.");
  };

  const remove = async (p: Plan) => {
    const ok = await confirmDialog({
      title: "Excluir plano",
      message: `Excluir o plano "${p.name}"? Só é possível se nenhum assinante o usa.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/plans/${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data?.success) {
      toast.success("Plano excluído.");
      await load();
    } else toast.error(data?.error || "Não foi possível excluir.");
  };

  const input = c.field;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Catálogo de Planos</h1>
            <p className={c.subtitle}>
              Planos do SaaS com preço por ciclo (mensal recorrente; semestral e anual à vista, já com
              desconto), limites e recursos inclusos.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo plano
          </button>
        )}
      </div>

      <div className={c.tableCard}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Mensal</th>
                <th className="px-5 py-3">Semestral</th>
                <th className="px-5 py-3">Anual</th>
                <th className="px-5 py-3">Limites</th>
                <th className="px-5 py-3">Trial</th>
                <th className="px-5 py-3">Assinantes</th>
                <th className="px-5 py-3">Situação</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={9} className={`px-5 py-12 text-center ${c.empty}`}>Nenhum plano cadastrado ainda.</td></tr>
              ) : plans.map((p) => (
                <tr key={p.id} className={`transition ${c.rowHover} ${!p.active ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3.5">
                    <span className={`font-bold text-sm block ${c.strong}`}>{p.name}</span>
                    {p.description && <span className="text-[11px] text-slate-500">{p.description}</span>}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-700">{brl(p.priceMonthly)}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{brl(p.priceSemiannual)}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{brl(p.priceAnnual)}</td>
                  <td className="px-5 py-3.5 text-slate-600">{p.maxRooms} UH · {p.maxUsers} us. · {p.aiTokenQuota.toLocaleString("pt-BR")} tok</td>
                  <td className="px-5 py-3.5 text-slate-600">{p.trialDays ? `${p.trialDays}d` : "—"}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{p._count.subscriptions}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canEdit && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleActive(p)} title={p.active ? "Desativar" : "Reativar"} className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-amber-500 hover:text-white transition">
                          <Power className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(p)} title="Editar" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-sky-600 hover:text-white transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(p)} title="Excluir" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white transition disabled:opacity-40" disabled={p._count.subscriptions > 0}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-2xl max-h-[92vh] overflow-y-auto`}>
            <div className={`p-5 border-b flex items-center justify-between sticky top-0 bg-white ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{modal.mode === "create" ? "Novo plano" : "Editar plano"}</h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <F label="Nome" required><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></F>
                <F label="Descrição"><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></F>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <F label="Preço mensal (R$)" required><input className={input} type="number" step="0.01" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} required /></F>
                <F label="Semestral (R$)"><input className={input} type="number" step="0.01" placeholder="não oferecido" value={form.priceSemiannual} onChange={(e) => setForm({ ...form, priceSemiannual: e.target.value })} /></F>
                <F label="Anual (R$)"><input className={input} type="number" step="0.01" placeholder="não oferecido" value={form.priceAnnual} onChange={(e) => setForm({ ...form, priceAnnual: e.target.value })} /></F>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <F label="Máx. quartos"><input className={input} type="number" value={form.maxRooms} onChange={(e) => setForm({ ...form, maxRooms: e.target.value })} /></F>
                <F label="Máx. usuários"><input className={input} type="number" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: e.target.value })} /></F>
                <F label="Cota IA (tokens/mês)"><input className={input} type="number" value={form.aiTokenQuota} onChange={(e) => setForm({ ...form, aiTokenQuota: e.target.value })} /></F>
                <F label="Dias de trial"><input className={input} type="number" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} /></F>
              </div>
              <F label="Recursos inclusos (um por linha)">
                <textarea className={input} rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder={"Suporte por WhatsApp\nAgente de IA de atendimento\nRelatórios avançados"} />
              </F>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Plano ativo (disponível para contratação)
              </label>
              <div className={`pt-1 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setModal(null)} className={c.ghostBtn}>Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {modal.mode === "create" ? "Criar plano" : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className={cadastroUI(false).label}>{label} {required && <span className="text-rose-500">*</span>}</label>
      {children}
    </div>
  );
}
