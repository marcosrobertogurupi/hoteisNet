"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Tags, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface Grupo {
  id: string;
  code: string | null;
  name: string;
  type: "PRODUTO" | "SERVICO" | "PRATO";
}

const EMPTY_FORM = { id: "", codigo: "", nome: "", tipo: "PRODUTO" as Grupo["type"] };

export default function GruposPage() {
  const { theme } = useTheme();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncGrupos = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/grupos");
      const data = await res.json();
      if (data?.success && Array.isArray(data.groups)) setGrupos(data.groups);
    } catch (err) {
      console.warn("[CadastroGrupos] Erro ao buscar grupos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncGrupos();
  }, [syncGrupos]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: Grupo) => {
    setForm({ id: g.id, codigo: g.code || "", nome: g.name, tipo: g.type });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Grupo",
      message: "Tem certeza que deseja excluir este grupo?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/grupos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o grupo.");
      return;
    }
    toast.success("Grupo excluído com sucesso.");
    await syncGrupos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Por favor, preencha o nome do grupo.");
      return;
    }

    const res = await fetch("/api/cadastros/grupos", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o grupo.");
      return;
    }
    toast.success(form.id ? "Grupo atualizado com sucesso." : "Grupo cadastrado com sucesso.");
    await syncGrupos();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando grupos..." submessage="Estamos carregando os grupos de produtos." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20 px-3 py-1 rounded-full font-bold">
            {grupos.length} grupo(s)
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-slate-500/10 border border-slate-500/20 text-slate-400 rounded-2xl">
              <Tags className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Grupos</h1>
              <p className="text-xs text-slate-400">Grupos de produtos, serviços e pratos usados no PDV e Restaurante (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-slate-600/20 transition">
            <Plus className="w-4 h-4" /> Novo Grupo
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código</th>
                <th className="px-5 py-3.5">Nome do Grupo</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {grupos.map((g) => (
                <tr key={g.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono font-bold text-white">{g.code || "-"}</td>
                  <td className="px-5 py-4 text-slate-200 font-medium">{g.name}</td>
                  <td className="px-5 py-4 font-mono text-slate-400">{g.type}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(g)} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(g.id)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {grupos.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-400">Nenhum grupo cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="border border-slate-800 bg-slate-900 text-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">{form.id ? "Editar Grupo" : "Novo Grupo"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Código</label>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-slate-500" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Nome <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-slate-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Tipo</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Grupo["type"] })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-slate-500">
                  <option value="PRODUTO">PRODUTO</option>
                  <option value="SERVICO">SERVIÇO</option>
                  <option value="PRATO">PRATO</option>
                </select>
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition">Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-slate-600/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
