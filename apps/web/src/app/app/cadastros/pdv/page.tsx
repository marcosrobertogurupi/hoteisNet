"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Store, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface PDV {
  id: string;
  code: string | null;
  name: string;
  location: string | null;
  operator: string | null;
  active: boolean;
}

const EMPTY_FORM = { id: "", codigo: "", nome: "", localizacao: "", operador: "", status: "ATIVO" as "ATIVO" | "INATIVO" };

export default function PDVPage() {
  const { theme } = useTheme();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [pdvs, setPdvs] = useState<PDV[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncPdvs = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/pdv");
      const data = await res.json();
      if (data?.success && Array.isArray(data.salesPoints)) setPdvs(data.salesPoints);
    } catch (err) {
      console.warn("[CadastroPDV] Erro ao buscar pontos de venda:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncPdvs();
  }, [syncPdvs]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: PDV) => {
    setForm({
      id: p.id,
      codigo: p.code || "",
      nome: p.name,
      localizacao: p.location || "",
      operador: p.operator || "",
      status: p.active ? "ATIVO" : "INATIVO",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Ponto de Venda",
      message: "Tem certeza que deseja excluir este ponto de venda?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/pdv?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o ponto de venda.");
      return;
    }
    toast.success("Ponto de venda excluído com sucesso.");
    await syncPdvs();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Por favor, preencha o nome do ponto de venda.");
      return;
    }

    const res = await fetch("/api/cadastros/pdv", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o ponto de venda.");
      return;
    }
    toast.success(form.id ? "Ponto de venda atualizado com sucesso." : "Ponto de venda cadastrado com sucesso.");
    await syncPdvs();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando pontos de venda..." submessage="Estamos carregando os PDVs cadastrados." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full font-bold">
            {pdvs.length} PDV(s)
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-2xl">
              <Store className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Pontos de Venda</h1>
              <p className="text-xs text-slate-400">Setores de venda do hotel: recepção, bar, restaurante (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-yellow-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Ponto de Venda
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código / Nome</th>
                <th className="px-5 py-3.5">Localização</th>
                <th className="px-5 py-3.5">Operador</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pdvs.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{p.name}</span>
                    <span className="font-mono text-[10px] text-yellow-400">{p.code || "-"}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-200">{p.location || "-"}</td>
                  <td className="px-5 py-4 text-slate-300">{p.operator || "-"}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${p.active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-300"}`}>
                      {p.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(p)} className="p-2 rounded-xl bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {pdvs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">Nenhum ponto de venda cadastrado.</td>
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
              <h2 className="text-lg font-bold">{form.id ? "Editar Ponto de Venda" : "Novo Ponto de Venda"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Código</label>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-yellow-500" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Nome <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-yellow-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Localização</label>
                <input type="text" value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-yellow-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Operador</label>
                  <input type="text" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-yellow-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "ATIVO" | "INATIVO" })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-yellow-500">
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                  </select>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition">Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-yellow-500/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
