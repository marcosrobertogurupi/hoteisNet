"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Receipt, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface MesaComanda {
  id: string;
  number: string;
  description: string | null;
  type: "MESA" | "COMANDA_AVULSA";
  status: "LIVRE" | "ABERTA";
}

const EMPTY_FORM = { id: "", numero: "", descricao: "", tipo: "MESA" as MesaComanda["type"], status: "LIVRE" as MesaComanda["status"] };

export default function ComandasPage() {
  const { theme } = useTheme();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [mesas, setMesas] = useState<MesaComanda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncMesas = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/comandas");
      const data = await res.json();
      if (data?.success && Array.isArray(data.tables)) setMesas(data.tables);
    } catch (err) {
      console.warn("[CadastroComandas] Erro ao buscar mesas/comandas:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncMesas();
  }, [syncMesas]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: MesaComanda) => {
    setForm({ id: m.id, numero: m.number, descricao: m.description || "", tipo: m.type, status: m.status });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Mesa/Comanda",
      message: "Tem certeza que deseja excluir este registro?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/comandas?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir.");
      return;
    }
    toast.success("Excluído com sucesso.");
    await syncMesas();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim()) {
      toast.warning("Por favor, preencha o número.");
      return;
    }

    const res = await fetch("/api/cadastros/comandas", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar.");
      return;
    }
    toast.success(form.id ? "Atualizado com sucesso." : "Cadastrado com sucesso.");
    await syncMesas();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando mesas e comandas..." submessage="Estamos carregando o cadastro de mesas." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-pink-500/10 text-pink-400 border border-pink-500/20 px-3 py-1 rounded-full font-bold">
            {mesas.length} registro(s)
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-2xl">
              <Receipt className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Mesas & Comandas</h1>
              <p className="text-xs text-slate-400">Restaurante, bar da piscina e comandas avulsas (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Mesa / Comanda
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Número / Identificador</th>
                <th className="px-5 py-3.5">Descrição / Localização</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {mesas.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono font-bold text-white text-base">
                    Nº {m.number}
                  </td>
                  <td className="px-5 py-4 text-slate-300 font-medium">{m.description || "-"}</td>
                  <td className="px-5 py-4 font-mono text-slate-400">{m.type}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === "LIVRE" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(m)} className="p-2 rounded-xl bg-slate-800 text-pink-400 hover:bg-pink-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(m.id)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {mesas.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">Nenhuma mesa/comanda cadastrada.</td>
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
              <h2 className="text-lg font-bold">{form.id ? "Editar Mesa/Comanda" : "Nova Mesa / Comanda"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Número <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-pink-500" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Descrição / Localização</label>
                  <input type="text" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-pink-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as MesaComanda["type"] })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-pink-500">
                    <option value="MESA">MESA</option>
                    <option value="COMANDA_AVULSA">COMANDA AVULSA</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MesaComanda["status"] })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-pink-500">
                    <option value="LIVRE">LIVRE</option>
                    <option value="ABERTA">ABERTA</option>
                  </select>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition">Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-500/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
