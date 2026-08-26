"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Tags, Plus, Search, Edit3, Trash2, ArrowLeft, Check, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface Categoria {
  id: string;
  name: string;
  description: string;
  kind: "LODGING" | "EVENT_SPACE";
}

const TENANT_ID = "tenant-hoteisnet-demo";

const EMPTY_FORM = { name: "", description: "", kind: "LODGING" as "LODGING" | "EVENT_SPACE" };

export default function CategoriasApartamentoPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncCategorias = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/categorias-apartamento?tenantId=${TENANT_ID}`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.categories)) return;
      setCategorias(
        data.categories.map((c: any) => ({
          id: c.id,
          name: c.name,
          description: c.description || "",
          kind: c.kind === "EVENT_SPACE" ? "EVENT_SPACE" : "LODGING",
        }))
      );
    } catch (err) {
      console.warn("[CategoriasApartamento] Erro na sincronização:", err);
    }
  }, []);

  useEffect(() => {
    syncCategorias();
  }, [syncCategorias]);

  const filtered = categorias.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (c: Categoria) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description,
      kind: c.kind,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.warning("Informe o nome da categoria.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/categorias-apartamento", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          tenantId: editingId ? undefined : TENANT_ID,
          name: form.name,
          description: form.description,
          kind: form.kind,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar a categoria.");
        return;
      }
      toast.success("Categoria salva com sucesso.");
      setIsFormOpen(false);
      syncCategorias();
    } catch (err) {
      console.error("[CategoriasApartamento] Erro ao salvar:", err);
      toast.error("Erro de conexão ao salvar a categoria.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Categoria",
      message: "Tem certeza que deseja excluir esta categoria de apartamento?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cadastros/categorias-apartamento?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível excluir a categoria.");
        return;
      }
      setCategorias((prev) => prev.filter((c) => c.id !== id));
      toast.success("Categoria excluída com sucesso.");
    } catch (err) {
      console.error("[CategoriasApartamento] Erro ao excluir:", err);
      toast.error("Erro de conexão ao excluir a categoria.");
    }
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600 shadow-sm";

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros/apartamentos"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para Apartamentos
          </Link>
          <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
            isDark ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-teal-50 text-teal-700 border-teal-200"
          }`}>
            Pré-cadastro por Assinante
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-teal-50 border-teal-200 text-teal-600"
            }`}>
              <Tags className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Categorias de Apartamento
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Cadastre as categorias/tipos de UH do seu hotel para uso no cadastro de Apartamentos.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nova Categoria
          </button>
        </div>

        {isFormOpen && (
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome da Categoria</label>
              <input
                type="text"
                autoFocus
                placeholder="Ex: Standard Casal, Suíte Executiva"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Descrição (opcional)</label>
              <input
                type="text"
                placeholder="Detalhes da categoria"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Finalidade</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as "LODGING" | "EVENT_SPACE" })}
                className={inputClass}
              >
                <option value="LODGING">Hospedagem (quarto/UH vendido por diária)</option>
                <option value="EVENT_SPACE">Espaço de eventos (auditório, sala de reunião)</option>
              </select>
              <p className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Espaços de eventos não são oferecidos como quarto no atendimento automático pelo WhatsApp — pedidos de reserva são encaminhados para a recepção.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
              >
                <Check className="w-4 h-4" /> Salvar
              </button>
              <button
                onClick={() => setIsFormOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition border ${
                  isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar categoria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
              isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-teal-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-600"
            }`}
          />
        </div>

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <table className="w-full text-left text-xs">
            <thead className={`font-mono border-b uppercase tracking-wider ${
              isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
            }`}>
              <tr>
                <th className="px-5 py-3.5">Categoria</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {filtered.map((c) => (
                <tr key={c.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                  <td className="px-5 py-4">
                    <div className="space-y-0.5">
                      <span className={`font-bold inline-flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                        {c.name}
                        {c.kind === "EVENT_SPACE" && (
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
                            isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            EVENTOS
                          </span>
                        )}
                      </span>
                      {c.description && (
                        <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>{c.description}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-teal-400 hover:bg-teal-600 hover:text-white" : "bg-slate-100 text-teal-700 hover:bg-teal-600 hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-5 py-12 text-center text-slate-400 space-y-2">
                    <Tags className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma categoria cadastrada</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
