"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CreditCard, Plus, Search, Edit3, Trash2, ArrowLeft, Check, X, CheckSquare } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";

interface FormaPagto {
  id: string;
  description: string;
  installment: boolean;
  debitGuestBalance: boolean;
  transferDebit: boolean;
  sumsToCashRegister: boolean;
}

const TENANT_ID = "tenant-hoteisnet-demo";

const EMPTY_FORM = {
  description: "",
  installment: false,
  debitGuestBalance: false,
  transferDebit: false,
  sumsToCashRegister: true,
};

export default function FormasPagamentoPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [formas, setFormas] = useState<FormaPagto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncFormas = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/formas-pagamento?tenantId=${TENANT_ID}`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.paymentMethods)) return;
      setFormas(
        data.paymentMethods.map((f: any) => ({
          id: f.id,
          description: f.description,
          installment: !!f.installment,
          debitGuestBalance: !!f.debitGuestBalance,
          transferDebit: !!f.transferDebit,
          sumsToCashRegister: !!f.sumsToCashRegister,
        }))
      );
    } catch (err) {
      console.warn("[FormasPagamento] Erro na sincronização:", err);
    }
  }, []);

  useEffect(() => {
    syncFormas();
  }, [syncFormas]);

  const filtered = formas.filter((f) => f.description.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleOpenEdit = (f: FormaPagto) => {
    setEditingId(f.id);
    setForm({
      description: f.description,
      installment: f.installment,
      debitGuestBalance: f.debitGuestBalance,
      transferDebit: f.transferDebit,
      sumsToCashRegister: f.sumsToCashRegister,
    });
  };

  const handleSave = async () => {
    if (!form.description.trim()) {
      toast.warning("Informe a descrição da forma de pagamento.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/formas-pagamento", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          tenantId: editingId ? undefined : TENANT_ID,
          description: form.description,
          installment: form.installment,
          debitGuestBalance: form.debitGuestBalance,
          transferDebit: form.transferDebit,
          sumsToCashRegister: form.sumsToCashRegister,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar a forma de pagamento.");
        return;
      }
      toast.success("Forma de pagamento salva com sucesso.");
      setEditingId(null);
      setForm(EMPTY_FORM);
      syncFormas();
    } catch (err) {
      console.error("[FormasPagamento] Erro ao salvar:", err);
      toast.error("Erro de conexão ao salvar a forma de pagamento.");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Forma de Pagamento",
      message: "Tem certeza que deseja excluir esta forma de pagamento?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/cadastros/formas-pagamento?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível excluir a forma de pagamento.");
        return;
      }
      setFormas((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      toast.success("Forma de pagamento excluída com sucesso.");
    } catch (err) {
      console.error("[FormasPagamento] Erro ao excluir:", err);
      toast.error("Erro de conexão ao excluir a forma de pagamento.");
    }
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2.5 bg-yellow-500/10 border border-yellow-500/40 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
    : "w-full px-3.5 py-2.5 bg-yellow-50 border border-yellow-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-violet-600 shadow-sm";

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
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
            isDark ? "bg-violet-500/10 text-violet-400 border-violet-500/20" : "bg-violet-50 text-violet-700 border-violet-200"
          }`}>
            Dados Sincronizados
          </span>
        </div>

        <div className={`flex items-center gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className={`p-3.5 border rounded-2xl ${
            isDark ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-violet-50 border-violet-200 text-violet-600"
          }`}>
            <CreditCard className="w-8 h-8" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Formas de Pagamento</h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Condições financeiras de recebimento em caixa: parcelamento, débito de saldo do hóspede, transferência entre quartos e soma no caixa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          {/* Coluna esquerda: lista + busca */}
          <div className="space-y-4">
            <div className={`border rounded-3xl overflow-hidden shadow-xl ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <table className="w-full text-left text-xs">
                <thead className={`font-mono border-b uppercase tracking-wider ${
                  isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
                }`}>
                  <tr>
                    <th className="px-5 py-3.5">Descrição Pagamento</th>
                    <th className="px-3 py-3.5 text-center">Soma Cx</th>
                    <th className="px-3 py-3.5 text-center">Conta C.</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                  {filtered.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => handleOpenEdit(f)}
                      className={`cursor-pointer transition ${
                        editingId === f.id
                          ? isDark ? "bg-violet-500/10" : "bg-violet-50"
                          : isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <span className={`font-bold block ${isDark ? "text-white" : "text-slate-900"}`}>{f.description}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {f.installment && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                              Parcelamento
                            </span>
                          )}
                          {f.debitGuestBalance && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                              Deb. Saldo Hóspede
                            </span>
                          )}
                          {f.transferDebit && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" : "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"}`}>
                              Transf.Débito
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-center">
                        {f.sumsToCashRegister && <Check className="w-4 h-4 text-emerald-500 inline" />}
                      </td>
                      <td className="px-3 py-4 text-center">
                        {!f.sumsToCashRegister && <Check className="w-4 h-4 text-emerald-500 inline" />}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(f); }}
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-violet-400 hover:bg-violet-600 hover:text-white" : "bg-slate-100 text-violet-700 hover:bg-violet-600 hover:text-white"
                            }`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(f.id); }}
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
                      <td colSpan={4} className="px-5 py-12 text-center text-slate-400 space-y-2">
                        <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma forma de pagamento cadastrada</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Nome da forma de pagamento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                  isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-violet-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-violet-600"
                }`}
              />
            </div>
          </div>

          {/* Coluna direita: formulário */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenAdd}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-500/20 transition"
              >
                <Plus className="w-4 h-4" /> [F2] Incluir
              </button>
              <button
                onClick={() => editingId && handleDelete(editingId)}
                disabled={!editingId}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition border ${
                  !editingId
                    ? isDark ? "border-slate-800 text-slate-600 cursor-not-allowed" : "border-slate-200 text-slate-400 cursor-not-allowed"
                    : isDark ? "border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white" : "border-rose-300 text-rose-600 hover:bg-rose-600 hover:text-white"
                }`}
              >
                <Trash2 className="w-4 h-4" /> [DEL] Excluir
              </button>
            </div>

            <div className={`p-5 rounded-2xl border space-y-5 ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <div className="space-y-1.5">
                <label className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Forma Pagamento</label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Dinheiro, Pix, Cartão..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.installment}
                    onChange={(e) => setForm({ ...form, installment: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Parcelamento</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipoConta"
                    checked={form.sumsToCashRegister}
                    onChange={() => setForm({ ...form, sumsToCashRegister: true })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Soma Caixa</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.debitGuestBalance}
                    onChange={(e) => setForm({ ...form, debitGuestBalance: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Debitar Saldo Hóspede</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tipoConta"
                    checked={!form.sumsToCashRegister}
                    onChange={() => setForm({ ...form, sumsToCashRegister: false })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Conta Corrente</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.transferDebit}
                    onChange={(e) => setForm({ ...form, transferDebit: e.target.checked })}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>Transf.Deb.</span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSave}
                  className="w-full px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  <CheckSquare className="w-4 h-4" /> Salvar
                </button>
                {editingId && (
                  <button
                    onClick={handleOpenAdd}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition border ${
                      isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
