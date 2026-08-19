"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BookOpen, Plus, Search, Edit3, Trash2, ArrowLeft, Check, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface PlanoConta {
  id: string;
  codigo: string;
  descricao: string;
  nivel: "Sintética" | "Analítica";
  creditoDebito: "CREDITO" | "DEBITO";
}

const TENANT_ID = "tenant-hoteisnet-demo";

// Profundidade da conta na árvore, com base nos segmentos "zerados" à direita do código.
// Ex: 01.00.00.00 -> 1 | 01.01.00.00 -> 2 | 01.01.01.00 -> 3 | 01.01.01.01 -> 4
function codeDepth(codigo: string): number {
  const segments = codigo.split(".");
  let depth = 1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== "00" && segments[i] !== "0") depth = i + 1;
  }
  return depth;
}

export default function PlanoContasPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [plano, setPlano] = useState<PlanoConta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codigoInput, setCodigoInput] = useState("");
  const [descricaoInput, setDescricaoInput] = useState("");
  const [nivelInput, setNivelInput] = useState<"Sintética" | "Analítica">("Analítica");
  const [crDbInput, setCrDbInput] = useState<"CREDITO" | "DEBITO">("DEBITO");

  const syncPlanoFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/plano-contas?tenantId=${TENANT_ID}`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.accounts)) return;

      setPlano(
        data.accounts.map((a: any) => ({
          id: a.id,
          codigo: a.code,
          descricao: a.description,
          nivel: a.level === "Sintética" ? "Sintética" : "Analítica",
          creditoDebito: a.creditoDebito === "CREDITO" ? "CREDITO" : "DEBITO",
        }))
      );
    } catch (err) {
      console.warn("[PlanoContas] Erro na sincronização:", err);
    }
  }, []);

  useEffect(() => {
    syncPlanoFromDatabase();
  }, [syncPlanoFromDatabase]);

  const filteredPlano = plano
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const handleOpenAdd = () => {
    setEditingId(null);
    setCodigoInput("");
    setDescricaoInput("");
    setNivelInput("Analítica");
    setCrDbInput("DEBITO");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: PlanoConta) => {
    setEditingId(p.id);
    setCodigoInput(p.codigo);
    setDescricaoInput(p.descricao);
    setNivelInput(p.nivel);
    setCrDbInput(p.creditoDebito);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!codigoInput.trim()) {
      toast.warning("Informe o código do plano de contas.");
      return;
    }
    if (!descricaoInput.trim()) {
      toast.warning("Informe a descrição da conta.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/plano-contas", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { id: editingId, code: codigoInput, description: descricaoInput, level: nivelInput, creditoDebito: crDbInput }
            : { tenantId: TENANT_ID, code: codigoInput, description: descricaoInput, level: nivelInput, creditoDebito: crDbInput }
        ),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar a conta.");
        return;
      }
      toast.success("Conta do plano de contas salva com sucesso.");
      setIsFormOpen(false);
      syncPlanoFromDatabase();
    } catch (err) {
      console.error("[PlanoContas] Erro ao salvar:", err);
      toast.error("Erro de conexão ao salvar a conta.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Conta",
      message: "Tem certeza que deseja excluir esta conta do plano de contas?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cadastros/plano-contas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível excluir a conta.");
        return;
      }
      setPlano((prev) => prev.filter((p) => p.id !== id));
      toast.success("Conta excluída com sucesso.");
    } catch (err) {
      console.error("[PlanoContas] Erro ao excluir:", err);
      toast.error("Erro de conexão ao excluir a conta.");
    }
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-cyan-600 shadow-sm";

  const selectClass = inputClass;

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-cyan-50 text-cyan-700 border-cyan-200"
            }`}
          >
            Dados Sincronizados
          </span>
        </div>

        <div
          className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-cyan-50 border-cyan-200 text-cyan-600"
              }`}
            >
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Plano de Contas Gerencial ({plano.length} Contas)
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Classificação de receitas, despesas e DRE gerencial do hotel (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por código ou conta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none w-64 transition ${
                  isDark
                    ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-cyan-500"
                    : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600"
                }`}
              />
            </div>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition"
            >
              <Plus className="w-4 h-4" /> Nova Conta Financeira
            </button>
          </div>
        </div>

        {isFormOpen && (
          <div
            className={`p-5 rounded-2xl border space-y-4 ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Plano de Contas
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: 01.01.01.01"
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Descrição do Plano de Contas
                </label>
                <input
                  type="text"
                  placeholder="Ex: SALARIO"
                  value={descricaoInput}
                  onChange={(e) => setDescricaoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Tipo
                </label>
                <select
                  value={nivelInput}
                  onChange={(e) => setNivelInput(e.target.value as "Sintética" | "Analítica")}
                  className={selectClass}
                >
                  <option value="Sintética">Sintético</option>
                  <option value="Analítica">Analítico</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  CR ou DB
                </label>
                <select
                  value={crDbInput}
                  onChange={(e) => setCrDbInput(e.target.value as "CREDITO" | "DEBITO")}
                  className={selectClass}
                >
                  <option value="CREDITO">Crédito</option>
                  <option value="DEBITO">Débito</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
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

        <div
          className={`border rounded-3xl overflow-hidden shadow-2xl ${
            isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
          }`}
        >
          <table className="w-full text-left text-xs">
            <thead
              className={`font-mono border-b uppercase tracking-wider ${
                isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              <tr>
                <th className="px-5 py-3.5">Código Estrutural</th>
                <th className="px-5 py-3.5">Descrição da Conta</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">CR ou DB</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {filteredPlano.map((p) => {
                const depth = codeDepth(p.codigo);
                const isSintetica = p.nivel === "Sintética";
                return (
                  <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-3.5 font-mono font-bold text-cyan-500">{p.codigo}</td>
                    <td className="px-5 py-3.5">
                      <span
                        style={{ paddingLeft: `${(depth - 1) * 1.25}rem` }}
                        className={`block ${
                          isSintetica
                            ? `font-extrabold uppercase tracking-wide ${isDark ? "text-white" : "text-slate-900"}`
                            : `font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`
                        }`}
                      >
                        {p.descricao}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isSintetica
                            ? isDark
                              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : isDark
                              ? "bg-slate-800 text-slate-300 border-slate-700"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {isSintetica ? "SINTÉTICO" : "ANALÍTICO"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          p.creditoDebito === "CREDITO" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        }`}
                      >
                        {p.creditoDebito === "CREDITO" ? "CRÉDITO" : "DÉBITO"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-cyan-400 hover:bg-cyan-600 hover:text-white" : "bg-slate-100 text-cyan-700 hover:bg-cyan-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-500 hover:text-white"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredPlano.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center space-y-2">
                    <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma conta cadastrada</p>
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
