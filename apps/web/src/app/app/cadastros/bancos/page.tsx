"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Landmark, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface Banco {
  id: string;
  bankCode: string | null;
  name: string;
  agency: string | null;
  account: string | null;
  pixKey: string | null;
}

const EMPTY_FORM = { id: "", codigoCompe: "", nomeBanco: "", agencia: "", conta: "", chavePix: "" };

export default function BancosPage() {
  const { theme } = useTheme();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [bancos, setBancos] = useState<Banco[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncBancos = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/bancos");
      const data = await res.json();
      if (data?.success && Array.isArray(data.banks)) setBancos(data.banks);
    } catch (err) {
      console.warn("[CadastroBancos] Erro ao buscar bancos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncBancos();
  }, [syncBancos]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (b: Banco) => {
    setForm({
      id: b.id,
      codigoCompe: b.bankCode || "",
      nomeBanco: b.name,
      agencia: b.agency || "",
      conta: b.account || "",
      chavePix: b.pixKey || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Banco",
      message: "Tem certeza que deseja excluir esta conta bancária?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/bancos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o banco.");
      return;
    }
    toast.success("Banco excluído com sucesso.");
    await syncBancos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nomeBanco.trim()) {
      toast.warning("Por favor, preencha o nome do banco.");
      return;
    }

    const res = await fetch("/api/cadastros/bancos", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o banco.");
      return;
    }
    toast.success(form.id ? "Banco atualizado com sucesso." : "Banco cadastrado com sucesso.");
    await syncBancos();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando bancos..." submessage="Estamos carregando as contas bancárias cadastradas." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-bold">
            {bancos.length} conta(s) cadastrada(s)
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
              <Landmark className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Bancos & Contas</h1>
              <p className="text-xs text-slate-400">Contas bancárias do hotel, agências, contas e chaves PIX de recebimento (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Conta Bancária / PIX
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">COMPE / Banco</th>
                <th className="px-5 py-3.5">Agência & Conta</th>
                <th className="px-5 py-3.5">Chave PIX de Recebimento</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {bancos.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{b.name}</span>
                    <span className="font-mono text-[10px] text-emerald-400">Código COMPE: {b.bankCode || "-"}</span>
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-200">
                    Ag: {b.agency || "-"} | C/C: {b.account || "-"}
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-300">
                    <span className="bg-slate-800 px-2.5 py-1 rounded text-sky-400 border border-slate-700">
                      {b.pixKey || "-"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(b)} className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(b.id)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {bancos.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-400">Nenhum banco cadastrado.</td>
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
              <h2 className="text-lg font-bold">{form.id ? "Editar Banco" : "Nova Conta Bancária / PIX"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-1">
                  <label className="text-xs font-semibold text-slate-300">Código COMPE</label>
                  <input type="text" value={form.codigoCompe} onChange={(e) => setForm({ ...form, codigoCompe: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-300">Nome do Banco <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.nomeBanco} onChange={(e) => setForm({ ...form, nomeBanco: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Agência</label>
                  <input type="text" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Conta</label>
                  <input type="text" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Chave PIX</label>
                <input type="text" value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition">Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
