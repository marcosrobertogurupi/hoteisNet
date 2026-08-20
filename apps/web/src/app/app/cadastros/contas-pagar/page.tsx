"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Wallet, Search, ArrowLeft, Check, X, CircleDollarSign, Clock, CheckCircle2, Plus } from "lucide-react";
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

interface Payable {
  id: string;
  supplierName: string;
  documentNumber: string;
  accountPlanCode: string | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  isPaid: boolean;
  paidAt: string | null;
  notes: string | null;
  settlements: Settlement[];
}

interface Supplier {
  id: string;
  name: string;
  tradeName?: string | null;
}

// Profundidade da conta na árvore do plano de contas — ver mesma lógica em cash-register/page.tsx
function codeDepth(codigo: string): number {
  const segments = codigo.split(".");
  let depth = 1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== "00" && segments[i] !== "0") depth = i + 1;
  }
  return depth;
}

function hasChildAccounts(codigo: string, allCodes: string[]): boolean {
  const depth = codeDepth(codigo);
  const prefix = codigo.split(".").slice(0, depth).join(".");
  return allCodes.some((other) => {
    if (other === codigo) return false;
    const otherDepth = codeDepth(other);
    if (otherDepth <= depth) return false;
    return other.split(".").slice(0, depth).join(".") === prefix;
  });
}

const fmtCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (v: string) => new Date(v).toLocaleDateString("pt-BR");

function todayInputDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ContasPagarPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const { operatorId, operatorName } = useOperator();

  const [payables, setPayables] = useState<Payable[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | "aberto" | "pago">("aberto");
  const [searchQuery, setSearchQuery] = useState("");

  const [baixaId, setBaixaId] = useState<string | null>(null);
  const [baixaValor, setBaixaValor] = useState("0,00");
  const [baixaData, setBaixaData] = useState("");
  const [baixaJuros, setBaixaJuros] = useState("0,00");
  const [baixaDesconto, setBaixaDesconto] = useState("0,00");
  const [baixaForma, setBaixaForma] = useState("DINHEIRO");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accountPlans, setAccountPlans] = useState<
    { id: string; code: string; description: string; isSintetica: boolean; depth: number }[]
  >([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountSearchRef = useRef<HTMLDivElement>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [novoSupplierId, setNovoSupplierId] = useState("");
  const [novoSupplierName, setNovoSupplierName] = useState("");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [novoAccountPlanId, setNovoAccountPlanId] = useState("");
  const [novoVencimento, setNovoVencimento] = useState("");
  const [novoValor, setNovoValor] = useState("0,00");
  const [novoObservacao, setNovoObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sync = useCallback(async () => {
    try {
      const qs = statusFilter !== "todos" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/cadastros/contas-pagar${qs}`);
      const data = await res.json();
      if (!data?.success || !Array.isArray(data.payables)) return;
      setPayables(data.payables);
    } catch (err) {
      console.warn("[ContasPagar] Erro na sincronização:", err);
    }
  }, [statusFilter]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    fetch("/api/cadastros/fornecedores")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.suppliers)) setSuppliers(data.suppliers);
      })
      .catch(() => {});

    fetch("/api/cadastros/plano-contas")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.accounts)) {
          const despesas = data.accounts.filter((a: any) => a.type === "DESPESA" && a.active !== false);
          const allCodes = despesas.map((a: any) => a.code);
          setAccountPlans(
            despesas
              .map((a: any) => ({
                id: a.id,
                code: a.code,
                description: a.description,
                isSintetica: a.level === "Sintética" || hasChildAccounts(a.code, allCodes),
                depth: codeDepth(a.code),
              }))
              .sort((a: any, b: any) => a.code.localeCompare(b.code))
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountSearchRef.current && !accountSearchRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = payables.filter((p) => p.supplierName.toLowerCase().includes(searchQuery.toLowerCase()));

  const openBaixa = (p: Payable) => {
    setBaixaId(p.id);
    setBaixaValor((Number(p.amount) - Number(p.amountPaid)).toFixed(2).replace(".", ","));
    setBaixaData(todayInputDate());
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
    if (!baixaData) {
      toast.warning("Informe a data do pagamento.");
      return;
    }
    try {
      const res = await fetch("/api/cadastros/contas-pagar/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountsPayableId: baixaId,
          amount: valorNum,
          paidAt: baixaData,
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
      console.error("[ContasPagar] Erro ao dar baixa:", err);
      toast.error("Erro de conexão ao registrar a baixa.");
    }
  };

  const resetNovo = () => {
    setNovoSupplierId("");
    setNovoSupplierName("");
    setNovoDocumento("");
    setNovoAccountPlanId("");
    setNovoVencimento("");
    setNovoValor("0,00");
    setNovoObservacao("");
    setAccountSearch("");
  };

  const handleCriarLancamento = async () => {
    const valorNum = Number(novoValor.replace(/\./g, "").replace(",", "."));
    if (!novoSupplierName.trim()) {
      toast.warning("Selecione ou informe o fornecedor.");
      return;
    }
    if (!novoDocumento.trim()) {
      toast.warning("Informe o número do documento.");
      return;
    }
    if (!novoAccountPlanId) {
      toast.warning("Selecione o plano de contas (código de despesa).");
      return;
    }
    if (!novoVencimento) {
      toast.warning("Informe a data de vencimento.");
      return;
    }
    if (!valorNum || valorNum <= 0) {
      toast.warning("Informe um valor maior que zero.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cadastros/contas-pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: novoSupplierId || undefined,
          supplierName: novoSupplierName.trim(),
          documentNumber: novoDocumento.trim(),
          accountPlanId: novoAccountPlanId,
          dueDate: novoVencimento,
          amount: valorNum,
          notes: novoObservacao || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao lançar conta a pagar.");
        return;
      }
      toast.success("Título de contas a pagar lançado com sucesso.");
      setShowNewModal(false);
      resetNovo();
      sync();
    } catch {
      toast.error("Falha ao lançar conta a pagar.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = isDark
    ? "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-rose-600 shadow-sm";

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

        <div className={`flex items-center justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"
            }`}>
              <Wallet className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Contas a Pagar</h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Títulos de despesas e fornecedores, com vencimento, plano de contas e baixa (total ou parcial).
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="shrink-0 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" /> Novo Lançamento
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex gap-2">
            {(["aberto", "pago", "todos"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                  statusFilter === s
                    ? "bg-rose-600 border-rose-600 text-white"
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
              placeholder="Buscar por fornecedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-rose-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-rose-600"
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
                <th className="px-5 py-3.5">Fornecedor</th>
                <th className="px-5 py-3.5">Documento</th>
                <th className="px-5 py-3.5">Plano de Contas</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5 text-right">Valor</th>
                <th className="px-5 py-3.5 text-right">Pago</th>
                <th className="px-5 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {filtered.map((p) => (
                <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                  <td className="px-5 py-4 font-bold">{p.supplierName}</td>
                  <td className={`px-5 py-4 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{p.documentNumber}</td>
                  <td className={`px-5 py-4 font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{p.accountPlanCode || "—"}</td>
                  <td className="px-5 py-4">{fmtDate(p.dueDate)}</td>
                  <td className="px-5 py-4 text-right font-mono font-bold">{fmtCurrency(Number(p.amount))}</td>
                  <td className="px-5 py-4 text-right font-mono">{fmtCurrency(Number(p.amountPaid))}</td>
                  <td className="px-5 py-4 text-center">
                    {p.isPaid ? (
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
                    {!p.isPaid && (
                      <button
                        onClick={() => openBaixa(p)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ml-auto transition ${
                          isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-700 hover:bg-rose-600 hover:text-white"
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
                    <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhum título encontrado</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal de Baixa */}
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
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Data do Pagamento</label>
                  <input type="date" value={baixaData} onChange={(e) => setBaixaData(e.target.value)} className={inputClass} />
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
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
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

        {/* Modal de Novo Lançamento */}
        {showNewModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-lg p-6 rounded-2xl border space-y-4 max-h-[90vh] overflow-y-auto ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Novo Lançamento — Contas a Pagar</h3>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Fornecedor</label>
                <select
                  value={novoSupplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setNovoSupplierId(id);
                    const s = suppliers.find((sup) => sup.id === id);
                    setNovoSupplierName(s ? s.name : "");
                  }}
                  className={inputClass}
                >
                  <option value="">Selecione um fornecedor cadastrado...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={novoSupplierName}
                  onChange={(e) => { setNovoSupplierName(e.target.value); setNovoSupplierId(""); }}
                  placeholder="Ou digite o nome do fornecedor..."
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nº do Documento</label>
                  <input type="text" value={novoDocumento} onChange={(e) => setNovoDocumento(e.target.value)} className={inputClass} placeholder="Ex: NF 1234" />
                </div>
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Vencimento</label>
                  <input type="date" value={novoVencimento} onChange={(e) => setNovoVencimento(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="space-y-1.5 relative" ref={accountSearchRef}>
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Plano de Contas (Código de Débito/Despesa)</label>
                {novoAccountPlanId ? (
                  <div className={`w-full rounded-xl px-3 py-2 text-sm border flex items-center justify-between gap-2 ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"}`}>
                    <span className="font-mono truncate">
                      {accountPlans.find((a) => a.id === novoAccountPlanId)?.code} - {accountPlans.find((a) => a.id === novoAccountPlanId)?.description}
                    </span>
                    <button type="button" onClick={() => { setNovoAccountPlanId(""); setAccountSearch(""); }} className={`shrink-0 hover:text-rose-400 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      onFocus={() => setAccountDropdownOpen(true)}
                      placeholder="Buscar por código ou nome da conta..."
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                )}

                {accountDropdownOpen && !novoAccountPlanId && (() => {
                  const q = accountSearch.trim().toLowerCase();
                  const visible = !q
                    ? accountPlans
                    : accountPlans.filter((a) => !a.isSintetica && (a.code.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)));

                  return (
                    <div className={`absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border shadow-xl ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"}`}>
                      {visible.map((a) =>
                        a.isSintetica ? (
                          <div
                            key={a.id}
                            style={{ paddingLeft: `${0.75 + (a.depth - 1) * 1}rem` }}
                            className={`px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide select-none ${isDark ? "text-slate-500" : "text-slate-400"}`}
                          >
                            {a.code} — {a.description}
                          </div>
                        ) : (
                          <button
                            type="button"
                            key={a.id}
                            onClick={() => { setNovoAccountPlanId(a.id); setAccountSearch(""); setAccountDropdownOpen(false); }}
                            style={{ paddingLeft: `${0.75 + a.depth * 1}rem` }}
                            className={`w-full text-left pr-3 py-1.5 text-xs transition-colors ${isDark ? "hover:bg-slate-700 text-slate-200" : "hover:bg-slate-100 text-slate-700"}`}
                          >
                            <span className="font-mono text-rose-400 font-semibold">{a.code}</span>{" "}
                            <span>{a.description}</span>
                          </button>
                        )
                      )}
                      {visible.length === 0 && (
                        <div className={`px-3 py-3 text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>Nenhuma conta encontrada.</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="0,00"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Observações</label>
                <input type="text" value={novoObservacao} onChange={(e) => setNovoObservacao(e.target.value)} className={inputClass} />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleCriarLancamento}
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  <Check className="w-4 h-4" /> Lançar
                </button>
                <button
                  onClick={() => { setShowNewModal(false); resetNovo(); }}
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
