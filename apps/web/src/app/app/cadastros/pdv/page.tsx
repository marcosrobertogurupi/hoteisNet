"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Store, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cadastroUI } from "../_ui";
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
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
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
      if (data?.success && Array.isArray(data.posLocations)) setPdvs(data.posLocations);
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
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando pontos de venda..." submessage="Estamos carregando os PDVs cadastrados." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full font-bold">
            {pdvs.length} PDV(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-2xl">
              <Store className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Pontos de Venda</h1>
              <p className={c.subtitle}>Setores de venda do hotel: recepção, bar, restaurante (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition">
            <Plus className="w-4 h-4" /> Novo Ponto de Venda
          </button>
        </div>

        <div className={c.tableCard}>
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3.5">Código / Nome</th>
                <th className="px-5 py-3.5">Localização</th>
                <th className="px-5 py-3.5">Operador</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {pdvs.map((p) => (
                <tr key={p.id} className={`transition ${c.rowHover}`}>
                  <td className="px-5 py-4">
                    <span className={`font-bold text-sm block ${c.strong}`}>{p.name}</span>
                    <span className="font-mono text-[10px] text-yellow-400">{p.code || "-"}</span>
                  </td>
                  <td className={`px-5 py-4 ${isDark ? "text-slate-200" : "text-slate-700"}`}>{p.location || "-"}</td>
                  <td className={`px-5 py-4 ${c.muted}`}>{p.operator || "-"}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${p.active ? "bg-emerald-500/20 text-emerald-400" : (isDark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600")}`}>
                      {p.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(p)} className={`p-2 rounded-xl transition ${isDark ? "bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white" : "bg-slate-100 text-yellow-700 hover:bg-yellow-600 hover:text-white"}`}><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(p.id)} className={`p-2 rounded-xl transition ${isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-700 hover:bg-rose-600 hover:text-white"}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {pdvs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className={`px-5 py-12 text-center ${c.empty}`}>Nenhum ponto de venda cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-6 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Ponto de Venda" : "Novo Ponto de Venda"}</h2>
              <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Código</label>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Nome <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={c.field} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Localização</label>
                <input type="text" value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value })} className={c.field} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Operador</label>
                  <input type="text" value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "ATIVO" | "INATIVO" })} className={c.field}>
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                  </select>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
