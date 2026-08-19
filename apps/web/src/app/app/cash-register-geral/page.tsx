"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, Lock, Unlock, Loader2, Printer, ShieldAlert } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useSession } from "@/context/SessionContext";
import { useTheme } from "@/context/ThemeContext";
import CaixaPrintPreview, { CashRegisterDTO } from "@/components/CaixaPrintPreview";

interface CaixaResumoDTO {
  id: string;
  operatorId: string;
  operatorName: string;
  isOpen: boolean;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  closingBalance: number | null;
  totalDinheiro: number;
  totalPix: number;
  totalCartao: number;
  totalSangrias: number;
  saldoTotal: number;
}

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CaixaGeralPage() {
  const toast = useToast();
  const { user } = useSession();
  const { hotelName, theme } = useTheme();

  const isAdmin = user ? ["SUPER_ADMIN", "TENANT_ADMIN"].includes(user.role) : false;

  const [loading, setLoading] = useState(true);
  const [caixas, setCaixas] = useState<CaixaResumoDTO[]>([]);
  const [printCaixa, setPrintCaixa] = useState<CashRegisterDTO | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const loadCaixas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/caixa/geral");
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao carregar caixas.");
        setCaixas([]);
        return;
      }
      setCaixas(data.caixas);
    } catch {
      toast.error("Falha ao carregar caixas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadCaixas();
  }, [isAdmin, loadCaixas]);

  useEffect(() => {
    const handleAfterPrint = () => setPrintCaixa(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const handleImprimir = async (id: string) => {
    setPrintingId(id);
    try {
      const res = await fetch(`/api/caixa/geral/${id}`);
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao carregar caixa para impressão.");
        return;
      }
      setPrintCaixa(data.caixa);
      setTimeout(() => window.print(), 300);
    } catch {
      toast.error("Falha ao carregar caixa para impressão.");
    } finally {
      setPrintingId(null);
    }
  };

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className={`p-8 rounded-2xl border text-center space-y-2 ${theme.bgCard}`}>
        <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
        <p className={`text-sm font-semibold ${theme.textMain}`}>Acesso restrito a administradores.</p>
      </div>
    );
  }

  const abertos = caixas.filter((c) => c.isOpen);
  const fechados = caixas.filter((c) => !c.isOpen);
  const totalGeralAberto = abertos.reduce((s, c) => s + c.saldoTotal, 0);
  const totalGeralFechado = fechados.reduce((s, c) => s + c.saldoTotal, 0);

  const renderTabela = (lista: CaixaResumoDTO[], vazio: string) => (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className={`text-xs font-mono border-b ${theme.borderColor} ${theme.isDark ? "bg-[#1E293B]/60 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
          <th className="p-3.5">OPERADOR</th>
          <th className="p-3.5">ABERTURA</th>
          <th className="p-3.5">FECHAMENTO</th>
          <th className="p-3.5">DINHEIRO</th>
          <th className="p-3.5">PIX</th>
          <th className="p-3.5">CARTÃO</th>
          <th className="p-3.5">SANGRIAS</th>
          <th className="p-3.5">SALDO</th>
          <th className="p-3.5"></th>
        </tr>
      </thead>
      <tbody className={`text-xs ${theme.isDark ? "divide-y divide-slate-800/60" : "divide-y divide-slate-200"}`}>
        {lista.length === 0 ? (
          <tr>
            <td colSpan={9} className={`p-6 text-center ${theme.textMuted}`}>{vazio}</td>
          </tr>
        ) : (
          lista.map((c) => (
            <tr key={c.id} className={`transition-colors ${theme.isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
              <td className={`p-3.5 font-semibold ${theme.textMain}`}>{c.operatorName}</td>
              <td className={`p-3.5 font-mono ${theme.textMuted}`}>{fmtDataHora(c.openedAt)}</td>
              <td className={`p-3.5 font-mono ${theme.textMuted}`}>{c.closedAt ? fmtDataHora(c.closedAt) : "—"}</td>
              <td className={`p-3.5 font-mono ${theme.textMuted}`}>{fmtBRL(c.totalDinheiro)}</td>
              <td className={`p-3.5 font-mono ${theme.textMuted}`}>{fmtBRL(c.totalPix)}</td>
              <td className={`p-3.5 font-mono ${theme.textMuted}`}>{fmtBRL(c.totalCartao)}</td>
              <td className="p-3.5 font-mono text-red-400">{fmtBRL(c.totalSangrias)}</td>
              <td className={`p-3.5 font-mono font-bold ${theme.textMain}`}>{fmtBRL(c.saldoTotal)}</td>
              <td className="p-3.5">
                <button
                  onClick={() => handleImprimir(c.id)}
                  disabled={printingId === c.id}
                  className={`px-2.5 py-1 border rounded text-[11px] font-semibold transition-colors flex items-center gap-1 disabled:opacity-50 ${theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"}`}
                >
                  <Printer className="w-3.5 h-3.5 text-sky-400" /> Imprimir
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      {printCaixa && <CaixaPrintPreview caixa={printCaixa} hotelName={hotelName} />}

      <div className="space-y-6 print:hidden">
        <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${theme.bgCard}`}>
          <div>
            <h2 className={`text-lg font-bold flex items-center gap-2 ${theme.textMain}`}>
              <DollarSign className="w-5 h-5 text-[#10B981]" />
              Caixa Geral — Todos os Operadores
            </h2>
            <p className={`text-xs mt-1 ${theme.textMuted}`}>
              Visão consolidada dos caixas abertos e fechados de todos os operadores do hotel, sem misturar os valores entre eles.
            </p>
          </div>
          {loading && (
            <span className={`px-3 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 ${theme.isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 font-mono">
          <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
            <span className={`text-xs font-sans font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
              <Unlock className="w-3.5 h-3.5 text-[#10B981]" /> Total em Caixas Abertos ({abertos.length})
            </span>
            <span className="text-xl font-bold text-[#10B981] block">{fmtBRL(totalGeralAberto)}</span>
          </div>
          <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
            <span className={`text-xs font-sans font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
              <Lock className="w-3.5 h-3.5 text-slate-400" /> Total em Caixas Fechados ({fechados.length})
            </span>
            <span className={`text-xl font-bold block ${theme.textMain}`}>{fmtBRL(totalGeralFechado)}</span>
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${theme.bgCard}`}>
          <div className={`p-4 border-b flex items-center gap-2 ${theme.borderColor}`}>
            <Unlock className="w-4 h-4 text-[#10B981]" />
            <h3 className={`text-sm font-semibold ${theme.textMain}`}>Caixas Abertos</h3>
          </div>
          <div className="overflow-x-auto">
            {renderTabela(abertos, "Nenhum caixa aberto no momento.")}
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${theme.bgCard}`}>
          <div className={`p-4 border-b flex items-center gap-2 ${theme.borderColor}`}>
            <Lock className="w-4 h-4 text-slate-400" />
            <h3 className={`text-sm font-semibold ${theme.textMain}`}>Caixas Fechados</h3>
          </div>
          <div className="overflow-x-auto">
            {renderTabela(fechados, "Nenhum caixa fechado ainda.")}
          </div>
        </div>
      </div>
    </div>
  );
}
