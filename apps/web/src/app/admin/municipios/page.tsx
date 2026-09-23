"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, X, Check, Loader2, Pencil, Trash2, Search, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../principal/cadastros/_ui";
import { UFS } from "@/lib/municipality";

const c = cadastroUI(false);
const PAGE_SIZE = 50;

interface Municipality {
  id: string;
  name: string;
  ibgeCode: string;
  uf: string;
  dddCode: string | null;
  updatedAt: string;
}

interface FormState {
  name: string;
  ibgeCode: string;
  uf: string;
  dddCode: string;
}

const EMPTY: FormState = { name: "", ibgeCode: "", uf: "", dddCode: "" };

// Cadastro GLOBAL de municípios (IBGE) — uma única tabela para todos os assinantes, usada para
// achar o código IBGE da cidade na FNRH/SNRHos e na NFC-e. Por afetar todos os hotéis, só a equipe
// da plataforma altera (o app do hotel apenas consulta).
export default function AdminMunicipiosPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [canEdit, setCanEdit] = useState(false);
  const [items, setItems] = useState<Municipality[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [uf, setUf] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; item: Municipality }>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setCanEdit(!!d.user.canEdit);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (appliedQ) params.set("q", appliedQ);
      if (uf) params.set("uf", uf);
      const res = await fetch(`/api/admin/municipios?${params}`);
      const data = await res.json();
      if (data?.success) {
        setItems(data.municipalities);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else toast.error(data?.error || "Erro ao carregar municípios.");
    } catch {
      toast.error("Falha de rede ao carregar municípios.");
    } finally {
      setLoading(false);
    }
  }, [page, appliedQ, uf, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Busca com pequeno atraso para não consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setAppliedQ(q.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const openCreate = () => {
    setForm({ ...EMPTY, uf });
    setModal({ mode: "create" });
  };

  const openEdit = (m: Municipality) => {
    setForm({ name: m.name, ibgeCode: m.ibgeCode, uf: m.uf, dddCode: m.dddCode || "" });
    setModal({ mode: "edit", item: m });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !modal) return;

    if (modal.mode === "edit") {
      const before = modal.item;
      const renamed = form.name.trim().toUpperCase() !== before.name || form.uf !== before.uf;
      if (renamed) {
        const ok = await confirmDialog({
          title: "Alterar nome/UF do município",
          message:
            `A FNRH (SNRHos) e a NFC-e de TODOS os hotéis encontram o código IBGE pelo nome + UF da cidade. ` +
            `Depois da alteração, cadastros com a cidade "${before.name}/${before.uf}" deixam de encontrá-lo. Continuar?`,
          confirmLabel: "Alterar",
          variant: "danger",
        });
        if (!ok) return;
      }
    }

    setSaving(true);
    try {
      const isCreate = modal.mode === "create";
      const res = await fetch(isCreate ? "/api/admin/municipios" : `/api/admin/municipios/${modal.item.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data?.success) {
        toast.error(data?.error || "Não foi possível salvar.");
        return;
      }
      toast.success(isCreate ? "Município incluído." : "Município atualizado.");
      setModal(null);
      await load();
    } catch {
      toast.error("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: Municipality) => {
    const ok = await confirmDialog({
      title: "Excluir município",
      message:
        `Excluir ${m.name}/${m.uf} (IBGE ${m.ibgeCode}) da tabela de TODOS os hotéis? ` +
        `Hóspedes e emitentes com essa cidade deixam de encontrar o código IBGE na FNRH e na NFC-e. ` +
        `Use só para remover um cadastro duplicado ou errado.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/municipios/${m.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data?.success) {
      toast.success("Município excluído.");
      await load();
    } else toast.error(data?.error || "Não foi possível excluir.");
  };

  const input = c.field;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl">
            <MapPin className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Municípios (IBGE)</h1>
            <p className={c.subtitle}>
              Tabela única compartilhada por todos os hotéis — usada para achar o código IBGE da cidade na FNRH
              (SNRHos) e na NFC-e. Alterações valem para todos os assinantes.
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo município
          </button>
        )}
      </div>

      <div className={`${c.tableCard} p-4 flex flex-wrap items-center gap-3`}>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className={`${input} pl-9`}
            placeholder="Buscar por nome ou código IBGE"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className={`${input} w-32`}
          value={uf}
          onChange={(e) => {
            setUf(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as UFs</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{total.toLocaleString("pt-BR")} município(s)</span>
      </div>

      <div className={c.tableCard}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3">Município</th>
                <th className="px-5 py-3">UF</th>
                <th className="px-5 py-3">Código IBGE</th>
                <th className="px-5 py-3">DDD</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`px-5 py-12 text-center ${c.empty}`}>
                    Nenhum município encontrado.
                  </td>
                </tr>
              ) : (
                items.map((m) => (
                  <tr key={m.id} className={`transition ${c.rowHover}`}>
                    <td className={`px-5 py-3 font-semibold ${c.strong}`}>{m.name}</td>
                    <td className="px-5 py-3 text-slate-600">{m.uf}</td>
                    <td className="px-5 py-3 font-mono text-slate-700">{m.ibgeCode}</td>
                    <td className="px-5 py-3 font-mono text-slate-600">{m.dddCode || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {canEdit && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(m)}
                            title="Editar"
                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-sky-600 hover:text-white transition"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => remove(m)}
                            title="Excluir"
                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-rose-600 hover:text-white transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className={`flex items-center justify-between px-5 py-3 border-t ${c.tdivide}`}>
          <span className="text-xs text-slate-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className={`${c.ghostBtn} flex items-center gap-1 disabled:opacity-40`}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className={`${c.ghostBtn} flex items-center gap-1 disabled:opacity-40`}
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-5 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{modal.mode === "create" ? "Novo município" : "Editar município"}</h2>
              <button
                onClick={() => setModal(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-5">
              <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Cadastro compartilhado por todos os hotéis. Confira o código no IBGE antes de salvar.</span>
              </div>
              <F label="Nome" required>
                <input
                  className={input}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
                  required
                />
              </F>
              <div className="grid grid-cols-3 gap-4">
                <F label="UF" required>
                  <select className={input} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} required>
                    <option value="">—</option>
                    {UFS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="Código IBGE" required>
                  <input
                    className={`${input} font-mono`}
                    inputMode="numeric"
                    maxLength={7}
                    value={form.ibgeCode}
                    onChange={(e) => setForm({ ...form, ibgeCode: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                    required
                  />
                </F>
                <F label="DDD">
                  <input
                    className={`${input} font-mono`}
                    inputMode="numeric"
                    maxLength={2}
                    value={form.dddCode}
                    onChange={(e) => setForm({ ...form, dddCode: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  />
                </F>
              </div>
              <div className={`pt-1 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setModal(null)} className={c.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {modal.mode === "create" ? "Incluir" : "Salvar"}
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
      <label className={cadastroUI(false).label}>
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
