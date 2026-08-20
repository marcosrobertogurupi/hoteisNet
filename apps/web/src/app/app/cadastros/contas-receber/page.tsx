"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Receipt, Search, ArrowLeft, Check, X, CircleDollarSign, Clock, CheckCircle2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";

interface Settlement {
  id: string;
  amount: number;
  interest: number;
  discount: number;
  paymentMethodDescription: string;
  paidAt: string;
}

interface Receivable {
  id: string;
  billedToName: string;
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  isPaid: boolean;
  paidAt: string | null;
  paymentMethodDescription: string;
  notes: string | null;
  settlements: Settlement[];
}

const fmtCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (v: string) => new Date(v).toLocaleDateString("pt-BR");

export default function ContasReceberPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const { operatorId, operatorName } = useOperator();

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | "aberto" | "pago">("aberto");
  const [searchQuery, setSearchQuery] = useState("");
  const [baixaId, setBaixaId] = useState<string | null>(null);
  const [baixaValor, setBaixaValor] = useState("0,00");
  const [baixaJuros, setBaixaJuros] = useState("0,00");
  const [baixaDesconto, setBaixaDesconto] = useState("0,00");
  const [baixaForma, setBaixaForma] = useState("DINHEIRO");

  const sync = useCallback(async () => {
    try {
      const qs = statusFilter !== "todos" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/cadastros/contas-receber${qs}`);
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.receivables)) return;
      setReceivables(data.receivables);
    } catch (err) {
      console.warn("[ContasReceber] Erro na sincronização:", err);
    }
  }, [statusFilter]);

  useEffect(() => {
    sync();
  }, [sync]);

  const filtered = receivables.filter((r) => r.billedToName.toLowerCase().includes(searchQuery.toLowerCase()));

  const openBaixa = (r: Receivable) => {
    setBaixaId(r.id);
    setBaixaValor((Number(r.amount) - Number(r.amountPaid)).toFixed(2).replace(".", ","));
    setBaixaJuros("0,00");
    setBaixaDesconto("0,00");
    setBaixaForma("DINHEIRO");
  };

  const handleBaixa = async () => {
    if (!baixaId) return;
    const valorNum = Number(baixaValor.replace(/\./g, "").replace(",", "."));
    if (!valorNum || valorNum <= 0) {
      toast.warning("Informe um valor de baixa maior que zero.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/contas-receber/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountsReceivableId: baixaId,
          amount: valorNum,
          interest: Number(baixaJuros.replace(/\./g, "").replace(",", ".")) || 0,
          discount: Number(baixaDesconto.replace(/\./g, "").replace(",", ".")) || 0,
          paymentMethodDescription: baixaForma,
          operatorId,
          operatorName,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível registrar a baixa.");
        return;
      }
      toast.success(result.message || "Baixa registrada com sucesso.");
      setBaixaId(null);
      sync();
    } catch (err) {
      console.error("[ContasReceber] Erro ao dar baixa:", err);
      toast.error("Erro de conexão ao registrar a baixa.");
    }
  };

  const inputClass = isDark
    ? "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-amber-600 shadow-sm";

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
        </div>

        <div className={`flex items-center gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className={`p-3.5 border rounded-2xl ${
            isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600"
          }`}>
            <Receipt className="w-8 h-8" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Contas a Receber</h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Títulos gerados por hospedagens fechadas com forma de pagamento parcelada — vencimento em 30 dias.
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex gap-2">
            {(["aberto", "pago", "todos"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                  statusFilter === s
                    ? "bg-amber-600 border-amber-600 text-white"
                    : isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s === "aberto" ? "Em aberto" : s === "pago" ? "Pagos" : "Todos"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por hóspede/empresa faturado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-amber-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-amber-600"
              }`}
            />
          </div>
        </div>

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <table className="w-full text-left text-xs">
            <thead className={`font-mono border-b uppercase tracking-wider ${
              isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
            }`}>
              <tr>
                <th className="px-5 py-3.5">Faturado para</th>
                <th className="px-5 py-3.5">Documento</th>
                <th className="px-5 py-3.5">Emissão</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5 text-right">Valor</th>
                <th className="px-5 py-3.5 text-right">Pago</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {filtered.map((r) => (
                <tr key={r.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                  <td className="px-5 py-4 font-bold">{r.billedToName}</td>
                  <td className={`px-5 py-4 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{r.documentNumber}</td>
                  <td className="px-5 py-4">{fmtDate(r.issueDate)}</td>
                  <td className="px-5 py-4">{fmtDate(r.dueDate)}</td>
                  <td className="px-5 py-4 text-right font-mono font-bold">{fmtCurrency(Number(r.amount))}</td>
                  <td className="px-5 py-4 text-right font-mono">{fmtCurrency(Number(r.amountPaid))}</td>
                  <td className="px-5 py-4 text-center">
                    {r.isPaid ? (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        <CheckCircle2 className="w-3 h-3" /> Pago
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        <Clock className="w-3 h-3" /> Aberto
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    {!r.isPaid && (
                      <button
                        onClick={() => openBaixa(r)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ml-auto transition ${
                          isDark ? "bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white" : "bg-slate-100 text-amber-700 hover:bg-amber-600 hover:text-white"
                        }`}
                      >
                        <CircleDollarSign className="w-3.5 h-3.5" /> Baixar
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400 space-y-2">
                    <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhum título encontrado</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {baixaId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-md p-6 rounded-2xl border space-y-4 ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Baixar Título</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Valor Pago</label>
                  <input type="text" value={baixaValor} onChange={(e) => setBaixaValor(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Forma de Pagamento</label>
                  <input type="text" value={baixaForma} onChange={(e) => setBaixaForma(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Juros</label>
                  <input type="text" value={baixaJuros} onChange={(e) => setBaixaJuros(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Desconto</label>
                  <input type="text" value={baixaDesconto} onChange={(e) => setBaixaDesconto(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleBaixa}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  <Check className="w-4 h-4" /> Confirmar Baixa
                </button>
                <button
                  onClick={() => setBaixaId(null)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition border ${
                    isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
