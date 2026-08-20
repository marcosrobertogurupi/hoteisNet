"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Wallet, Search, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

interface GuestOption {
  id: string;
  fullName: string;
  cpf: string | null;
  balance: number;
}

interface LedgerEntry {
  id: string;
  type: "CREDITO" | "DEBITO";
  amount: number;
  paymentMethodDescription: string | null;
  description: string | null;
  createdAt: string;
}

const fmtCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (v: string) => new Date(v).toLocaleString("pt-BR");

export default function SaldoHospedePage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<GuestOption[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<GuestOption | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) return;
    try {
      const res = await fetch(`/api/cadastros/saldo-hospede?search=${encodeURIComponent(searchTerm.trim())}`);
      const data = await res.json();
      if (!data?.success) return;
      setResults(data.guests || []);
    } catch (err) {
      console.warn("[SaldoHospede] Erro na busca:", err);
    }
  }, [searchTerm]);

  const openGuest = async (g: GuestOption) => {
    try {
      const res = await fetch(`/api/cadastros/saldo-hospede?guestId=${g.id}`);
      const data = await res.json();
      if (!data?.success) {
        toast.error(data.error || "Não foi possível carregar o extrato do hóspede.");
        return;
      }
      setSelectedGuest({ ...g, balance: data.guest.balance });
      setEntries(data.entries || []);
      setResults([]);
      setSearchTerm("");
    } catch (err) {
      console.error("[SaldoHospede] Erro ao carregar extrato:", err);
      toast.error("Erro de conexão ao carregar o extrato.");
    }
  };

  // Calcula o saldo corrente acumulado linha a linha, na ordem cronológica, para exibir a coluna
  // "Saldo" do extrato — igual ao Edt_Saldo do Win_MovHospede original.
  let running = 0;
  const rows = entries.map((e) => {
    running += e.type === "CREDITO" ? Number(e.amount) : -Number(e.amount);
    return { ...e, runningBalance: running };
  });

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-5xl mx-auto space-y-6">
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
            isDark ? "bg-sky-500/10 border-sky-500/20 text-sky-400" : "bg-sky-50 border-sky-200 text-sky-600"
          }`}>
            <Wallet className="w-8 h-8" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Saldo do Hóspede</h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Extrato de créditos e débitos do saldo credor do hóspede, para uso em hospedagens futuras.
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar hóspede por nome ou CPF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition ${
              isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-sky-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-600"
            }`}
          />
        </div>

        {results.length > 0 && (
          <div className={`border rounded-2xl overflow-hidden ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`}>
            {results.map((g) => (
              <button
                key={g.id}
                onClick={() => openGuest(g)}
                className={`w-full flex items-center justify-between px-5 py-3 text-left text-sm transition ${
                  isDark ? "hover:bg-slate-800/60 text-white" : "hover:bg-slate-50 text-slate-900"
                }`}
              >
                <span>
                  {g.fullName} {g.cpf && <span className="text-xs text-slate-400 font-mono">({g.cpf})</span>}
                </span>
                <span className={`font-mono font-bold ${g.balance >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {fmtCurrency(g.balance)}
                </span>
              </button>
            ))}
          </div>
        )}

        {selectedGuest && (
          <>
            <div className={`p-5 rounded-2xl border flex items-center justify-between ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <div>
                <p className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{selectedGuest.fullName}</p>
                {selectedGuest.cpf && <p className="text-xs text-slate-400 font-mono">{selectedGuest.cpf}</p>}
              </div>
              <div className="text-right">
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Saldo Atual</p>
                <p className={`text-2xl font-mono font-extrabold ${selectedGuest.balance >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {fmtCurrency(selectedGuest.balance)}
                </p>
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
                    <th className="px-5 py-3.5">Data/Hora</th>
                    <th className="px-5 py-3.5">Tipo</th>
                    <th className="px-5 py-3.5">Descrição</th>
                    <th className="px-5 py-3.5">Forma Pagto</th>
                    <th className="px-5 py-3.5 text-right">Valor</th>
                    <th className="px-5 py-3.5 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                  {rows.map((e) => (
                    <tr key={e.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                      <td className="px-5 py-3">{fmtDateTime(e.createdAt)}</td>
                      <td className="px-5 py-3">
                        {e.type === "CREDITO" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                            <TrendingUp className="w-3.5 h-3.5" /> Crédito
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                            <TrendingDown className="w-3.5 h-3.5" /> Débito
                          </span>
                        )}
                      </td>
                      <td className={isDark ? "px-5 py-3 text-slate-300" : "px-5 py-3 text-slate-600"}>{e.description || "—"}</td>
                      <td className="px-5 py-3 font-mono">{e.paymentMethodDescription || "—"}</td>
                      <td className={`px-5 py-3 text-right font-mono font-bold ${e.type === "CREDITO" ? "text-emerald-500" : "text-rose-500"}`}>
                        {e.type === "CREDITO" ? "+" : "-"}{fmtCurrency(Number(e.amount))}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">{fmtCurrency(e.runningBalance)}</td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-slate-400 space-y-2">
                        <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma movimentação de saldo</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
