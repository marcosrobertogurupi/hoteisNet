"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Layers, Plus, Search, Edit3, Trash2, ArrowLeft, Check, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface Andar {
  id: string;
  name: string;
  active: boolean;
}

const TENANT_ID = "tenant-hoteisnet-demo";

export default function AndaresPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [andares, setAndares] = useState<Andar[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  const syncAndares = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/andares?tenantId=${TENANT_ID}`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.floors)) return;
      setAndares(data.floors.map((f: any) => ({ id: f.id, name: f.name, active: f.active })));
    } catch (err) {
      console.warn("[Andares] Erro na sincronização:", err);
    }
  }, []);

  useEffect(() => {
    syncAndares();
  }, [syncAndares]);

  const filtered = andares.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleOpenAdd = () => {
    setEditingId(null);
    setNameInput("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (a: Andar) => {
    setEditingId(a.id);
    setNameInput(a.name);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!nameInput.trim()) {
      toast.warning("Informe o nome do andar.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/andares", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId ? { id: editingId, name: nameInput } : { tenantId: TENANT_ID, name: nameInput }
        ),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar o andar.");
        return;
      }
      toast.success("Andar salvo com sucesso.");
      setIsFormOpen(false);
      syncAndares();
    } catch (err) {
      console.error("[Andares] Erro ao salvar:", err);
      toast.error("Erro de conexão ao salvar o andar.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Andar",
      message: "Tem certeza que deseja excluir este andar do pré-cadastro?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cadastros/andares?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível excluir o andar.");
        return;
      }
      setAndares((prev) => prev.filter((a) => a.id !== id));
      toast.success("Andar excluído com sucesso.");
    } catch (err) {
      console.error("[Andares] Erro ao excluir:", err);
      toast.error("Erro de conexão ao excluir o andar.");
    }
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600 shadow-sm";

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-4xl mx-auto space-y-6">
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
              <Layers className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Andares do Hotel
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Cadastre os andares existentes no seu hotel para uso no cadastro de Apartamentos.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Andar
          </button>
        </div>

        {isFormOpen && (
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
          }`}>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Nome do Andar
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: 1º Andar, Térreo, Cobertura"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className={inputClass}
                />
              </div>
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
            placeholder="Buscar andar..."
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
                <th className="px-5 py-3.5">Andar</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {filtered.map((a) => (
                <tr key={a.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                  <td className={`px-5 py-4 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{a.name}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(a)}
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-teal-400 hover:bg-teal-600 hover:text-white" : "bg-slate-100 text-teal-700 hover:bg-teal-600 hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
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
                    <Layers className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhum andar cadastrado</p>
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
