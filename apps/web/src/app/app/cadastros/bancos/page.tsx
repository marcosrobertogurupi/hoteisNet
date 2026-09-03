"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Landmark, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { cadastroUI } from "../_ui";

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
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
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

  const field = `w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${
    isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-emerald-500" : "bg-white border border-slate-300 text-slate-900 focus:border-emerald-500"
  }`;

  return (
    <div className={c.page(theme.bgApp, theme.textMain)}>
      <LoadingOverlay show={isLoading} message="Buscando bancos..." submessage="Estamos carregando as contas bancárias cadastradas." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {bancos.length} conta(s) cadastrada(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-600"
              }`}
            >
              <Landmark className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Bancos &amp; Contas</h1>
              <p className={c.subtitle}>
                Contas bancárias do hotel, agências, contas e chaves PIX de recebimento (SaaS Multi-tenant).
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nova Conta Bancária / PIX
          </button>
        </div>

        <div className={c.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-5 py-3.5">COMPE / Banco</th>
                  <th className="px-5 py-3.5">Agência &amp; Conta</th>
                  <th className="px-5 py-3.5">Chave PIX de Recebimento</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {bancos.map((b) => (
                  <tr key={b.id} className={`transition ${c.rowHover}`}>
                    <td className="px-5 py-4">
                      <span className={`font-bold text-sm block ${c.strong}`}>{b.name}</span>
                      <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">Código COMPE: {b.bankCode || "-"}</span>
                    </td>
                    <td className={`px-5 py-4 font-mono ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      Ag: {b.agency || "-"} | C/C: {b.account || "-"}
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <span
                        className={`px-2.5 py-1 rounded border ${
                          isDark ? "bg-slate-800 text-sky-400 border-slate-700" : "bg-slate-100 text-sky-700 border-slate-200"
                        }`}
                      >
                        {b.pixKey || "-"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(b)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white" : "bg-slate-100 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
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

                {bancos.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className={`px-5 py-12 text-center ${c.empty}`}>
                      Nenhum banco cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-6 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Banco" : "Nova Conta Bancária / PIX"}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-1">
                  <label className={c.label}>Código COMPE</label>
                  <input type="text" value={form.codigoCompe} onChange={(e) => setForm({ ...form, codigoCompe: e.target.value })} className={field} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>
                    Nome do Banco <span className="text-rose-500">*</span>
                  </label>
                  <input type="text" required value={form.nomeBanco} onChange={(e) => setForm({ ...form, nomeBanco: e.target.value })} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Agência</label>
                  <input type="text" value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} className={field} />
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Conta</label>
                  <input type="text" value={form.conta} onChange={(e) => setForm({ ...form, conta: e.target.value })} className={field} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Chave PIX</label>
                <input type="text" value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} className={field} />
              </div>
              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
                >
                  <Check className="w-4 h-4" /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
