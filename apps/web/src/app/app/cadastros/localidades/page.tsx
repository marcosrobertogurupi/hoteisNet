"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Globe, Plus, Search, Edit3, Trash2, ArrowLeft, X, Loader2, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../_ui";

interface Municipality {
  id: string;
  name: string;
  ibgeCode: string;
  uf: string;
  dddCode: string | null;
  country: string;
}

const EMPTY_FORM = { name: "", ibgeCode: "", uf: "", dddCode: "" };

export default function LocalidadesPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const ui = cadastroUI(isDark);
  const { isAdmin } = useSession();
  const confirm = useConfirm();

  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchMunicipalities = useCallback(async (q: string, pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), pageSize: "50" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/cadastros/municipios?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setMunicipalities(data.municipalities);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("Erro ao buscar municípios:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchMunicipalities(search, 1), 300);
    setPage(1);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchMunicipalities(search, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const openNewModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (m: Municipality) => {
    setEditingId(m.id);
    setForm({ name: m.name, ibgeCode: m.ibgeCode, uf: m.uf, dddCode: m.dddCode || "" });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/cadastros/municipios/${editingId}` : "/api/cadastros/municipios";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setFormError(data.error || "Erro ao salvar município.");
        return;
      }
      setShowModal(false);
      fetchMunicipalities(search, page);
    } catch (err: any) {
      setFormError(err.message || "Erro de conexão ao salvar município.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: Municipality) => {
    const ok = await confirm({
      title: "Excluir município",
      message: `Excluir "${m.name}/${m.uf}" (código IBGE ${m.ibgeCode})? Esta é uma lista compartilhada por todos os assinantes.`,
      variant: "danger",
      confirmLabel: "Excluir",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cadastros/municipios/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchMunicipalities(search, page);
      }
    } catch (err) {
      console.error("Erro ao excluir município:", err);
    }
  };

  const field = `w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none ${
    isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-blue-500" : "bg-white border border-slate-300 text-slate-900 focus:border-blue-500"
  }`;

  return (
    <div className={ui.page(theme.bgApp, theme.textMain)}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={ui.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {total.toLocaleString("pt-BR")} municípios cadastrados
          </span>
        </div>

        <div className={ui.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600"
              }`}
            >
              <Globe className="w-8 h-8" />
            </div>
            <div>
              <h1 className={ui.title}>Tabela de Cidades, UFs &amp; Países</h1>
              <p className={ui.subtitle}>
                Tabela oficial IBGE de municípios, usada para emissão fiscal e FNRH — compartilhada por todos os assinantes.
              </p>
            </div>
          </div>
          {isAdmin ? (
            <button
              onClick={openNewModal}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Nova Cidade / Município
            </button>
          ) : (
            <span className={`text-xs flex items-center gap-1.5 ${ui.empty}`}>
              <Lock className="w-3.5 h-3.5" /> Incluir/editar restrito a administradores
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome da cidade, UF ou código IBGE..."
            className={`w-full rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none transition ${
              isDark
                ? "bg-slate-900/80 border border-slate-800 text-white placeholder:text-slate-500 focus:border-blue-500"
                : "bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500"
            }`}
          />
        </div>

        <div className={ui.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={ui.thead}>
                <tr>
                  <th className="px-5 py-3.5">Código IBGE</th>
                  <th className="px-5 py-3.5">Cidade / Município</th>
                  <th className="px-5 py-3.5">UF / Estado</th>
                  <th className="px-5 py-3.5">País</th>
                  {isAdmin && <th className="px-5 py-3.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${ui.tdivide}`}>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={`px-5 py-10 text-center ${ui.empty}`}>
                      <Loader2 className="w-5 h-5 animate-spin inline-block" />
                    </td>
                  </tr>
                ) : municipalities.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`px-5 py-10 text-center ${ui.empty}`}>
                      Nenhum município encontrado.
                    </td>
                  </tr>
                ) : (
                  municipalities.map((m) => (
                    <tr key={m.id} className={`transition ${ui.rowHover}`}>
                      <td className="px-5 py-4 font-mono text-blue-600 dark:text-blue-400 font-bold">{m.ibgeCode}</td>
                      <td className={`px-5 py-4 font-bold text-sm ${ui.strong}`}>{m.name}</td>
                      <td className={`px-5 py-4 font-mono ${ui.muted}`}>{m.uf}</td>
                      <td className={`px-5 py-4 ${ui.muted}`}>{m.country}</td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditModal(m)}
                              className={`p-2 rounded-xl transition ${
                                isDark ? "bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white" : "bg-slate-100 text-blue-700 hover:bg-blue-600 hover:text-white"
                              }`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(m)}
                              className={`p-2 rounded-xl transition ${
                                isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                              }`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={`flex items-center justify-between px-5 py-3.5 border-t text-xs ${ui.modalDivider} ${ui.muted}`}>
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={`p-1.5 rounded-lg disabled:opacity-40 transition ${isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={`p-1.5 rounded-lg disabled:opacity-40 transition ${isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className={ui.modalBackdrop} onClick={() => setShowModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className={`${ui.modalCard} max-w-md`}>
            <div className={`flex items-center justify-between p-5 border-b ${ui.modalDivider}`}>
              <h3 className="font-bold text-sm">{editingId ? "Editar Município" : "Novo Município"}</h3>
              <button
                onClick={() => setShowModal(false)}
                className={isDark ? "text-slate-500 hover:text-white" : "text-slate-400 hover:text-slate-900"}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">{formError}</div>
              )}
              <div className="space-y-1">
                <label className={`font-medium ${ui.label}`}>Nome do Município</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={field} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className={`font-medium ${ui.label}`}>Código IBGE</label>
                  <input
                    value={form.ibgeCode}
                    onChange={(e) => setForm((p) => ({ ...p, ibgeCode: e.target.value.replace(/\D/g, "") }))}
                    maxLength={7}
                    placeholder="7 dígitos"
                    className={`${field} font-mono`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={`font-medium ${ui.label}`}>UF</label>
                  <input
                    value={form.uf}
                    onChange={(e) => setForm((p) => ({ ...p, uf: e.target.value.toUpperCase() }))}
                    maxLength={2}
                    className={`${field} font-mono`}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className={`font-medium ${ui.label}`}>DDD (opcional)</label>
                <input
                  value={form.dddCode}
                  onChange={(e) => setForm((p) => ({ ...p, dddCode: e.target.value.replace(/\D/g, "") }))}
                  maxLength={2}
                  className={`${field} w-24 font-mono`}
                />
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${ui.modalDivider} ${isDark ? "bg-slate-900/50" : "bg-slate-50"}`}>
              <button onClick={() => setShowModal(false)} className={ui.ghostBtn}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.ibgeCode || !form.uf}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingId ? "Salvar Alterações" : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
