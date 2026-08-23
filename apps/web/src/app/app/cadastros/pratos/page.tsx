"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { UtensilsCrossed, Plus, Search, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface Prato {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  price: number | string;
  description: string | null;
}

const EMPTY_FORM = { id: "", codigo: "", nome: "", categoria: "", preco: "", descricao: "" };

export default function PratosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [pratos, setPratos] = useState<Prato[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncPratos = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/pratos");
      const data = await res.json();
      if (data?.success && Array.isArray(data.dishes)) setPratos(data.dishes);
    } catch (err) {
      console.warn("[CadastroPratos] Erro ao buscar pratos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncPratos();
  }, [syncPratos]);

  const filtered = pratos.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.code || "").includes(searchQuery) ||
    (p.category || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Prato) => {
    setForm({
      id: p.id,
      codigo: p.code || "",
      nome: p.name,
      categoria: p.category || "",
      preco: String(p.price),
      descricao: p.description || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Prato",
      message: "Tem certeza que deseja excluir este prato?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/pratos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o prato.");
      return;
    }
    toast.success("Prato excluído com sucesso.");
    await syncPratos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Por favor, preencha o nome do prato.");
      return;
    }

    const res = await fetch("/api/cadastros/pratos", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o prato.");
      return;
    }
    toast.success(form.id ? "Prato atualizado com sucesso." : "Prato cadastrado com sucesso.");
    await syncPratos();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando pratos..." submessage="Estamos carregando o cardápio cadastrado." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
            isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {pratos.length} prato(s)
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"
            }`}>
              <UtensilsCrossed className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Pratos & Cardápio
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Itens de restaurante, porções, refeições e bar (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Prato / Item Cardápio
          </button>
        </div>

        <div className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar prato por nome ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-red-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-600"
              }`}
            />
          </div>
          <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Cadastrados: <strong className={isDark ? "text-white" : "text-slate-900"}>{pratos.length}</strong>
          </span>
        </div>

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`font-mono border-b uppercase tracking-wider ${
                isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                <tr>
                  <th className="px-5 py-3.5">Código / Prato</th>
                  <th className="px-5 py-3.5">Categoria</th>
                  <th className="px-5 py-3.5">Preço de Venda</th>
                  <th className="px-5 py-3.5">Descrição</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filtered.map((p) => (
                  <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4">
                      <span className={`font-bold text-sm block ${isDark ? "text-white" : "text-slate-900"}`}>{p.name}</span>
                      <span className={`font-mono text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Cód: {p.code || "-"}</span>
                    </td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{p.category || "-"}</td>
                    <td className="px-5 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {Number(p.price).toFixed(2)}
                    </td>
                    <td className={`px-5 py-4 max-w-xs truncate ${isDark ? "text-slate-400" : "text-slate-600"}`}>{p.description || "-"}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleOpenEdit(p)} className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white" : "bg-slate-100 text-red-700 hover:bg-red-600 hover:text-white"
                        }`}>
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                        }`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className={`px-5 py-12 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>Nenhum prato cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden ${
            isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className={`p-6 border-b flex items-center justify-between ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Prato" : "Novo Prato / Item Cardápio"}</h2>
              <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Código</label>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={`w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-red-500" : "bg-white border border-slate-300 text-slate-900 focus:border-red-600"}`} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={`w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-red-500" : "bg-white border border-slate-300 text-slate-900 focus:border-red-600"}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Categoria</label>
                  <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className={`w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-red-500" : "bg-white border border-slate-300 text-slate-900 focus:border-red-600"}`} />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Preço (R$) <span className="text-rose-500">*</span></label>
                  <input type="number" step="0.01" min="0" required value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} className={`w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-red-500" : "bg-white border border-slate-300 text-slate-900 focus:border-red-600"}`} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Descrição</label>
                <textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className={`w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-red-500" : "bg-white border border-slate-300 text-slate-900 focus:border-red-600"}`} />
              </div>
              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={`px-5 py-2.5 rounded-xl border text-xs font-semibold transition ${isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
