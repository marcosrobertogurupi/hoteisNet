"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Globe, Plus, Search, Edit3, Trash2, ArrowLeft, X, Loader2, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useConfirm } from "@/context/ConfirmContext";

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

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full font-bold">
            {total.toLocaleString("pt-BR")} municípios cadastrados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl">
              <Globe className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Tabela de Cidades, UFs & Países</h1>
              <p className="text-xs text-slate-400">
                Tabela oficial IBGE de municípios, usada para emissão fiscal e FNRH — compartilhada por todos os assinantes.
              </p>
            </div>
          </div>
          {isAdmin ? (
            <button
              onClick={openNewModal}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition"
            >
              <Plus className="w-4 h-4" /> Nova Cidade / Município
            </button>
          ) : (
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Incluir/editar restrito a administradores
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome da cidade, UF ou código IBGE..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código IBGE</th>
                <th className="px-5 py-3.5">Cidade / Município</th>
                <th className="px-5 py-3.5">UF / Estado</th>
                <th className="px-5 py-3.5">País</th>
                {isAdmin && <th className="px-5 py-3.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : municipalities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    Nenhum município encontrado.
                  </td>
                </tr>
              ) : (
                municipalities.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4 font-mono text-blue-400 font-bold">{m.ibgeCode}</td>
                    <td className="px-5 py-4 font-bold text-white text-sm">{m.name}</td>
                    <td className="px-5 py-4 font-mono text-slate-300">{m.uf}</td>
                    <td className="px-5 py-4 text-slate-300">{m.country}</td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEditModal(m)} className="p-2 rounded-xl bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white transition">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(m)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 text-xs text-slate-400">
              <span>
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg bg-slate-800 disabled:opacity-40 hover:bg-slate-700 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[9997] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0F172A] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">{editingId ? "Editar Município" : "Novo Município"}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">{formError}</div>
              )}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Nome do Município</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Código IBGE</label>
                  <input
                    value={form.ibgeCode}
                    onChange={(e) => setForm((p) => ({ ...p, ibgeCode: e.target.value.replace(/\D/g, "") }))}
                    maxLength={7}
                    placeholder="7 dígitos"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">UF</label>
                  <input
                    value={form.uf}
                    onChange={(e) => setForm((p) => ({ ...p, uf: e.target.value.toUpperCase() }))}
                    maxLength={2}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">DDD (opcional)</label>
                <input
                  value={form.dddCode}
                  onChange={(e) => setForm((p) => ({ ...p, dddCode: e.target.value.replace(/\D/g, "") }))}
                  maxLength={2}
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-900/50">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.ibgeCode || !form.uf}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5"
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
