"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Search, X, Check, Loader2, Copy, KeyRound, Pencil, LogIn } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false); // painel admin: tema claro fixo

const STATUS_META: Record<string, { label: string; cls: string }> = {
  TRIAL: { label: "Degustação", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  ACTIVE: { label: "Ativo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  OVERDUE: { label: "Inadimplente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  SUSPENDED: { label: "Suspenso", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  CANCELLED: { label: "Cancelado", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

const TAX_REGIMES = [
  { value: "SIMPLES_NACIONAL", label: "01 - Simples Nacional" },
  { value: "LUCRO_PRESUMIDO", label: "02 - Lucro Presumido" },
  { value: "LUCRO_REAL", label: "03 - Lucro Real" },
  { value: "MEI", label: "04 - MEI" },
];

interface TenantRow {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  email: string;
  city: string | null;
  state: string | null;
  status: string;
  accessValidUntil: string | null;
  usersCount: number;
  roomsCount: number;
  planName: string | null;
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: string;
  maxRooms: number;
}

interface FormState {
  name: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  taxRegime: string;
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  website: string;
  interestRate: string;
  accessValidUntil: string;
  internalNotes: string;
  status: string;
  planId: string;
  adminName: string;
  adminEmail: string;
}

const EMPTY_FORM: FormState = {
  name: "", tradeName: "", cnpj: "", stateRegistration: "", taxRegime: "", zipCode: "", street: "",
  number: "", neighborhood: "", city: "", state: "", phone: "", email: "", website: "", interestRate: "",
  accessValidUntil: "", internalNotes: "", status: "TRIAL", planId: "", adminName: "", adminEmail: "",
};

const fmtCnpj = (v: string | null) =>
  v ? v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—";
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export default function AdminTenantsPage() {
  const toast = useToast();

  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; id: string }>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  const pageSize = 25;

  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => {
      if (d?.success) setCanEdit(!!d.user.canEdit);
    }).catch(() => {});
    fetch("/api/admin/plans").then((r) => r.json()).then((d) => {
      if (d?.success) setPlans(d.plans);
    }).catch(() => {});
  }, []);

  const impersonate = async (id: string, label: string) => {
    setImpersonatingId(id);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/impersonate`, { method: "POST" });
      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || "Não foi possível personificar.");
        return;
      }
      toast.success(`Entrando como ${label}…`);
      window.location.href = data.redirectTo || "/app";
    } catch {
      toast.error("Falha de rede ao personificar.");
    } finally {
      setImpersonatingId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/tenants?${params}`);
      const data = await res.json();
      if (data?.success) {
        setRows(data.tenants);
        setTotal(data.total);
      } else {
        toast.error(data?.error || "Erro ao carregar assinantes.");
      }
    } catch {
      toast.error("Falha de rede ao carregar assinantes.");
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setCreatedCreds(null);
    setModal({ mode: "create" });
  };

  const openEdit = async (id: string) => {
    setModal({ mode: "edit", id });
    setCreatedCreds(null);
    setForm({ ...EMPTY_FORM });
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || "Erro ao abrir a ficha.");
        setModal(null);
        return;
      }
      const t = data.tenant;
      setForm({
        name: t.name || "", tradeName: t.tradeName || "", cnpj: t.cnpj || "",
        stateRegistration: t.stateRegistration || "", taxRegime: t.taxRegime || "",
        zipCode: t.zipCode || "", street: t.street || "", number: t.number || "",
        neighborhood: t.neighborhood || "", city: t.city || "", state: t.state || "",
        phone: t.phone || "", email: t.email || "", website: t.website || "",
        interestRate: t.interestRate != null ? String(t.interestRate) : "",
        accessValidUntil: toDateInput(t.accessValidUntil), internalNotes: t.internalNotes || "",
        status: t.status || "TRIAL", planId: t.subscriptions?.[0]?.plan?.id || "",
        adminName: "", adminEmail: "",
      });
    } catch {
      toast.error("Falha de rede ao abrir a ficha.");
      setModal(null);
    }
  };

  const lookupCep = async () => {
    const cep = form.zipCode.replace(/\D/g, "");
    if (cep.length !== 8) {
      toast.warning("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (d?.erro) {
        toast.warning("CEP não encontrado.");
        return;
      }
      setForm((f) => ({
        ...f,
        street: d.logradouro || f.street,
        neighborhood: d.bairro || f.neighborhood,
        city: d.localidade || "",
        state: (d.uf || "").toUpperCase(),
      }));
    } catch {
      toast.error("Falha ao consultar o CEP.");
    } finally {
      setCepLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const isCreate = modal?.mode === "create";
      const url = isCreate ? "/api/admin/tenants" : `/api/admin/tenants/${(modal as any).id}`;
      const method = isCreate ? "POST" : "PATCH";
      const payload: Record<string, unknown> = {
        name: form.name, tradeName: form.tradeName, cnpj: form.cnpj, stateRegistration: form.stateRegistration,
        taxRegime: form.taxRegime || null, zipCode: form.zipCode, number: form.number, phone: form.phone,
        email: form.email, website: form.website,
        interestRate: form.interestRate === "" ? null : form.interestRate,
        accessValidUntil: form.accessValidUntil || null, internalNotes: form.internalNotes,
      };
      if (isCreate) {
        payload.planId = form.planId;
        payload.adminName = form.adminName;
        payload.adminEmail = form.adminEmail;
      } else {
        payload.status = form.status;
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || "Não foi possível salvar.");
        return;
      }
      if (isCreate && data.admin) {
        setCreatedCreds(data.admin);
        toast.success("Assinante criado e ambiente provisionado.");
      } else {
        toast.success("Assinante atualizado.");
        setModal(null);
      }
      await load();
    } catch {
      toast.error("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const input = `${c.field}`;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Assinantes & Hotéis</h1>
            <p className={c.subtitle}>
              Cadastro, provisionamento e ciclo de vida dos hotéis contratantes. O assinante nunca se
              auto-cadastra — todo ambiente nasce aqui.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Cadastrar novo assinante
          </button>
        )}
      </div>

      <div className={c.toolbar}>
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Buscar por nome, fantasia, CNPJ ou cidade…"
            className={`${input} pl-9 py-2`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
          className={`${input} py-2 md:w-52`}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className={c.tableCard}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3">Estabelecimento</th>
                <th className="px-5 py-3">CNPJ</th>
                <th className="px-5 py-3">Cidade/UF</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">UHs / Usuários</th>
                <th className="px-5 py-3">Acesso até</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className={`px-5 py-12 text-center ${c.empty}`}>Nenhum assinante encontrado.</td></tr>
              ) : rows.map((t) => {
                const sm = STATUS_META[t.status] || STATUS_META.TRIAL;
                return (
                  <tr key={t.id} className={`transition ${c.rowHover}`}>
                    <td className="px-5 py-3.5">
                      <span className={`font-bold text-sm block ${c.strong}`}>{t.tradeName || t.name}</span>
                      <span className="text-[11px] text-slate-500">{t.email}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">{fmtCnpj(t.cnpj)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{[t.city, t.state].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-5 py-3.5">
                      {t.planName
                        ? <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold">{t.planName}</span>
                        : <span className="text-slate-400">sem plano</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-600">{t.roomsCount} / {t.usersCount}</td>
                    <td className="px-5 py-3.5 text-slate-600">{fmtDate(t.accessValidUntil)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sm.cls}`}>{sm.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && t.status !== "CANCELLED" && (
                          <button
                            onClick={() => impersonate(t.id, t.tradeName || t.name)}
                            disabled={impersonatingId === t.id}
                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-amber-500 hover:text-white transition disabled:opacity-50"
                            title="Entrar como este assinante"
                          >
                            {impersonatingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(t.id)}
                          className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-sky-600 hover:text-white transition"
                          title={canEdit ? "Editar" : "Ver ficha"}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 text-xs text-slate-500">
          <span>{total} assinante(s)</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={c.ghostBtn + " disabled:opacity-40"}>Anterior</button>
            <span className="font-mono">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className={c.ghostBtn + " disabled:opacity-40"}>Próxima</button>
          </div>
        </div>
      </div>

      {modal && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-3xl max-h-[92vh] overflow-y-auto`}>
            <div className={`p-5 border-b flex items-center justify-between sticky top-0 bg-white ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">
                {modal.mode === "create" ? "Novo assinante" : canEdit ? "Editar assinante" : "Ficha do assinante"}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdCreds ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Check className="w-5 h-5" /> <span className="font-semibold">Ambiente provisionado.</span>
                </div>
                <p className="text-sm text-slate-600">
                  Envie estas credenciais ao primeiro administrador do hotel. A senha temporária só
                  aparece agora — ele deve trocá-la no primeiro acesso.
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">E-mail</span>
                    <span className="font-mono">{createdCreds.email}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Senha temporária</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">{createdCreds.tempPassword}</span>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(createdCreds.tempPassword); toast.success("Senha copiada."); }}
                        className="p-1 rounded hover:bg-slate-200"
                      ><Copy className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setModal(null)} className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold">Concluir</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="p-6 space-y-5">
                <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Razão social" required>
                      <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </Field>
                    <Field label="Nome fantasia">
                      <input className={input} value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
                    </Field>
                    <Field label="CNPJ">
                      <input className={input} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                    </Field>
                    <Field label="Inscrição estadual">
                      <input className={input} value={form.stateRegistration} onChange={(e) => setForm({ ...form, stateRegistration: e.target.value })} />
                    </Field>
                    <Field label="Regime tributário">
                      <select className={input} value={form.taxRegime} onChange={(e) => setForm({ ...form, taxRegime: e.target.value })}>
                        <option value="">—</option>
                        {TAX_REGIMES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Juros de mora (% a.m.)">
                      <input className={input} type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="CEP">
                      <div className="flex gap-1.5">
                        <input className={input} value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
                        <button type="button" onClick={lookupCep} disabled={cepLoading} className="px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs shrink-0">
                          {cepLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                        </button>
                      </div>
                    </Field>
                    <Field label="Logradouro" className="md:col-span-2">
                      <input className={input} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                    </Field>
                    <Field label="Número">
                      <input className={input} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                    </Field>
                    <Field label="Bairro">
                      <input className={input} value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
                    </Field>
                    <Field label="Cidade (via CEP)">
                      <input className={`${input} bg-slate-100`} value={form.city} readOnly />
                    </Field>
                    <Field label="UF (via CEP)">
                      <input className={`${input} bg-slate-100`} value={form.state} readOnly />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Telefone">
                      <input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </Field>
                    <Field label="E-mail do assinante" required>
                      <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </Field>
                    <Field label="Site">
                      <input className={input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label={modal.mode === "create" ? "Plano contratado" : "Plano"} required={modal.mode === "create"}>
                      <select
                        className={input}
                        value={form.planId}
                        onChange={(e) => setForm({ ...form, planId: e.target.value })}
                        disabled={modal.mode === "edit"}
                        required={modal.mode === "create"}
                      >
                        <option value="">{plans.length ? "Selecione…" : "Nenhum plano cadastrado"}</option>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} — R$ {Number(p.priceMonthly).toFixed(2)}/mês</option>
                        ))}
                      </select>
                    </Field>
                    <Field label='Acesso válido até ("data_Reset")'>
                      <input className={input} type="date" value={form.accessValidUntil} onChange={(e) => setForm({ ...form, accessValidUntil: e.target.value })} />
                    </Field>
                    {modal.mode === "edit" && (
                      <Field label="Status / ciclo de vida">
                        <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>

                  <Field label="Anotações internas (nunca vistas pelo assinante)">
                    <textarea className={input} rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
                  </Field>

                  {modal.mode === "create" && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sky-800 text-sm font-semibold">
                        <KeyRound className="w-4 h-4" /> Primeiro administrador do hotel
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Nome" required>
                          <input className={input} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
                        </Field>
                        <Field label="E-mail de acesso" required>
                          <input className={input} type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
                        </Field>
                      </div>
                      <p className="text-[11px] text-sky-700">
                        Uma senha temporária será gerada e mostrada uma única vez ao concluir.
                      </p>
                    </div>
                  )}
                </fieldset>

                <div className={`pt-1 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                  <button type="button" onClick={() => setModal(null)} className={c.ghostBtn}>
                    {canEdit ? "Cancelar" : "Fechar"}
                  </button>
                  {canEdit && (
                    <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {modal.mode === "create" ? "Criar e provisionar" : "Salvar alterações"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, className = "", children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className={cadastroUI(false).label}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
