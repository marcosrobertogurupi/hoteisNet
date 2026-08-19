"use client";

import { useCallback, useEffect, useState } from "react";
import { DollarSign, Lock, Unlock, ArrowDownRight, Loader2, Printer } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";
import { useTheme } from "@/context/ThemeContext";
import CaixaPrintPreview, { CashRegisterDTO } from "@/components/CaixaPrintPreview";
import { CAIXA_CHANGED_EVENT } from "@/lib/caixaEvents";

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function TenantCashRegisterPage() {
  const toast = useToast();
  const { operatorName } = useOperator();
  const { hotelName, theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [caixa, setCaixa] = useState<CashRegisterDTO | null>(null);
  const [bleedAmount, setBleedAmount] = useState("");
  const [bleedMotivo, setBleedMotivo] = useState("");
  const [bleedAccountPlanId, setBleedAccountPlanId] = useState("");
  const [accountPlans, setAccountPlans] = useState<{ id: string; code: string; description: string }[]>([]);
  const [showBleedModal, setShowBleedModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingFund, setOpeningFund] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const loadSessao = useCallback(async () => {
    try {
      const res = await fetch("/api/caixa/sessao");
      const data = await res.json();
      setCaixa(data.success && data.isOpen ? data.caixa : null);
    } catch {
      toast.error("Falha ao carregar dados do caixa.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSessao();
  }, [loadSessao]);

  // Plano de contas para o campo "Destino do Recurso" da retirada de caixa — permite ao gerente
  // identificar, no relatório de fechamento, para onde foi cada retirada (pagamento de despesa,
  // depósito no cofre etc.), em vez de um texto livre sem categoria.
  useEffect(() => {
    fetch("/api/cadastros/plano-contas")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.accounts)) {
          setAccountPlans(
            data.accounts
              .filter((a: any) => a.type === "DESPESA" && a.active !== false && a.level !== "Sintética")
              .map((a: any) => ({ id: a.id, code: a.code, description: a.description }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Após o usuário imprimir (ou fechar) o diálogo de impressão, recarrega a sessão do caixa e
  // avisa o gate de abertura obrigatória — relevante principalmente após o fechamento, quando o
  // caixa deixa de estar aberto e o sistema volta a exigir abertura antes de continuar.
  useEffect(() => {
    const handleAfterPrint = () => {
      setShowPrintPreview(false);
      loadSessao();
      window.dispatchEvent(new Event(CAIXA_CHANGED_EVENT));
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [loadSessao]);

  const handleAbrirCaixa = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/caixa/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundoTroco: Number(openingFund) || 0 }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao abrir caixa.");
        return;
      }
      toast.success(data.message || "Caixa aberto com sucesso!");
      setShowOpenModal(false);
      setOpeningFund("");
      await loadSessao();
      window.dispatchEvent(new Event(CAIXA_CHANGED_EVENT));
    } catch {
      toast.error("Falha ao abrir caixa.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteBleed = async () => {
    if (!bleedAmount || Number(bleedAmount) <= 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/caixa/sangria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: Number(bleedAmount),
          motivo: bleedMotivo || undefined,
          accountPlanId: bleedAccountPlanId || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao executar retirada.");
        return;
      }
      toast.success(data.message || "Retirada de caixa executada com sucesso!");
      setShowBleedModal(false);
      setBleedAmount("");
      setBleedMotivo("");
      setBleedAccountPlanId("");
      await loadSessao();
    } catch {
      toast.error("Falha ao executar sangria.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFecharCaixa = async () => {
    if (!caixa) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/caixa/fechar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saldoInformado: caixa.saldoTotal }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao fechar caixa.");
        return;
      }
      toast.success(data.message || "Caixa fechado com sucesso!");
      // Preenche a data/hora do fechamento e abre o diálogo de impressão do caixa, no padrão
      // do sistema WinDev original, permitindo ao usuário imprimir ou não o relatório.
      setCaixa((prev) => (prev ? { ...prev, closedAt: new Date().toISOString() } : prev));
      setShowPrintPreview(true);
      setTimeout(() => window.print(), 300);
    } catch {
      toast.error("Falha ao fechar caixa.");
    } finally {
      setSubmitting(false);
    }
  };

  const isOpen = !!caixa && !caixa.closedAt;

  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="space-y-6">
      {/* Print Preview — relatório de impressão do caixa, no padrão do sistema WinDev original. */}
      {showPrintPreview && caixa && <CaixaPrintPreview caixa={caixa} hotelName={hotelName} />}

      {/* Conteúdo normal da tela — oculto durante a impressão, que usa somente o print-container acima */}
      <div className="space-y-6 print:hidden">
      {/* Banner */}
      <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${theme.bgCard}`}>
        <div>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${theme.textMain}`}>
            <DollarSign className="w-5 h-5 text-[#10B981]" />
            Gestão de Caixa Operacional & Fechamento por Operador
          </h2>
          <p className={`text-xs mt-1 ${theme.textMuted}`}>
            Controle de abertura, sangrias, suprimentos de troco, conciliação Pix/Cartão e fechamento cego.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {loading ? (
            <span className={`px-3 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 ${theme.isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </span>
          ) : isOpen ? (
            <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-semibold text-xs flex items-center gap-1.5">
              <Unlock className="w-4 h-4" /> Caixa aberto: {caixa!.operatorName}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 font-semibold text-xs flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> Caixa Fechado
              </span>
              <button
                onClick={() => setShowOpenModal(true)}
                className="px-3 py-1.5 bg-[#10B981]/15 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/30 rounded text-xs font-semibold transition-colors"
              >
                Abrir Caixa
              </button>
            </div>
          )}
        </div>
      </div>

      {!loading && !isOpen && (
        <div className={`p-8 rounded-2xl border text-center text-sm ${theme.bgCard} ${theme.textMuted}`}>
          Nenhum caixa aberto para {operatorName}. Clique em &quot;Abrir Caixa&quot; para iniciar o turno.
        </div>
      )}

      {isOpen && (
        <>
          {/* Totals Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
            <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
              <span className={`text-xs font-sans font-medium block ${theme.textMuted}`}>Fundo de Abertura</span>
              <span className={`text-xl font-bold block ${theme.textMain}`}>{fmtBRL(caixa!.openingBalance)}</span>
              <span className={`text-[10px] font-sans block ${theme.textMuted}`}>Dinheiro em Espécie</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
              <span className={`text-xs font-sans font-medium block ${theme.textMuted}`}>Recebimentos Pix</span>
              <span className="text-xl font-bold text-[#10B981] block">{fmtBRL(caixa!.totalPix)}</span>
              <span className={`text-[10px] font-sans block ${theme.textMuted}`}>Conciliado via QR Code</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
              <span className={`text-xs font-sans font-medium block ${theme.textMuted}`}>Cartão Crédito / Débito</span>
              <span className="text-xl font-bold text-[#0284C7] block">{fmtBRL(caixa!.totalCartao)}</span>
              <span className={`text-[10px] font-sans block ${theme.textMuted}`}>Maquininha TEF/POS</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-1 ${theme.bgCard}`}>
              <span className={`text-xs font-sans font-medium block ${theme.textMuted}`}>Saldo Total em Caixa</span>
              <span className="text-xl font-bold text-[#38BDF8] block">{fmtBRL(caixa!.saldoTotal)}</span>
              <span className={`text-[10px] font-sans block ${theme.textMuted}`}>Líquido de Sangrias</span>
            </div>
          </div>

          {/* Action Controls & Transactions Table */}
          <div className={`rounded-2xl border overflow-hidden space-y-4 ${theme.bgCard}`}>
            <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${theme.borderColor}`}>
              <h3 className={`text-sm font-semibold ${theme.textMain}`}>Movimentações do Turno Atual</h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className={`px-3 py-1.5 border rounded text-xs font-semibold transition-colors flex items-center gap-1 ${theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"}`}
                >
                  <Printer className="w-4 h-4 text-sky-400" /> Imprimir Caixa
                </button>

                <button
                  onClick={() => setShowBleedModal(true)}
                  className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded text-xs font-semibold transition-colors flex items-center gap-1"
                >
                  <ArrowDownRight className="w-4 h-4" /> Retirada de Caixa
                </button>

                <button
                  onClick={handleFecharCaixa}
                  disabled={submitting}
                  className={`px-3 py-1.5 border rounded text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50 ${theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"}`}
                >
                  <Lock className="w-4 h-4 text-red-400" /> Fechar Caixa Cego
                </button>
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-xs font-mono border-b ${theme.borderColor} ${theme.isDark ? "bg-[#1E293B]/60 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
                  <th className="p-3.5">HORA / ID</th>
                  <th className="p-3.5">DESCRIÇÃO DA MOVIMENTAÇÃO</th>
                  <th className="p-3.5">MEIO DE PAGAMENTO</th>
                  <th className="p-3.5">VALOR</th>
                </tr>
              </thead>
              <tbody className={`text-xs ${theme.isDark ? "divide-y divide-slate-800/60" : "divide-y divide-slate-200"}`}>
                {caixa!.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`p-6 text-center ${theme.textMuted}`}>
                      Nenhuma movimentação registrada neste turno.
                    </td>
                  </tr>
                ) : (
                  caixa!.transactions.map((trx) => {
                    const signedAmount = trx.type === "SANGRIA" ? -trx.amount : trx.amount;
                    return (
                      <tr key={trx.id} className={`transition-colors ${theme.isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                        <td className="p-3.5 font-mono">
                          <span className={`font-bold block ${theme.textMain}`}>{fmtHora(trx.createdAt)}</span>
                          <span className={`text-[10px] ${theme.textMuted}`}>{trx.id.slice(0, 8)}</span>
                        </td>
                        <td className={`p-3.5 font-medium ${theme.textMain}`}>{trx.description}</td>
                        <td className={`p-3.5 font-mono ${theme.textMuted}`}>{trx.paymentMethod}</td>
                        <td className="p-3.5 font-mono font-semibold">
                          {signedAmount > 0 ? (
                            <span className="text-[#10B981]">+ {fmtBRL(signedAmount)}</span>
                          ) : (
                            <span className="text-red-400">- {fmtBRL(Math.abs(signedAmount))}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Abrir Caixa */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border ${theme.bgCard}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.borderColor}`}>
              <h3 className={`text-base font-semibold flex items-center gap-2 ${theme.textMain}`}>
                <Unlock className="w-4 h-4 text-[#10B981]" />
                Abrir Caixa — {operatorName}
              </h3>
              <button onClick={() => setShowOpenModal(false)} className={`hover:${theme.textMain} text-sm ${theme.textMuted}`}>✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Fundo de Troco (Dinheiro em Espécie)</label>
                <input
                  type="number"
                  value={openingFund}
                  onChange={(e) => setOpeningFund(e.target.value)}
                  placeholder="Ex: 200.00"
                  className={`w-full rounded-lg px-3 py-2 font-mono text-sm border focus:outline-none focus:border-[#10B981] ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
                />
              </div>
            </div>

            <div className={`flex justify-end gap-3 pt-3 border-t ${theme.borderColor}`}>
              <button
                onClick={() => setShowOpenModal(false)}
                className={`px-4 py-2 text-sm rounded-lg ${theme.isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleAbrirCaixa}
                disabled={submitting}
                className="px-4 py-2 bg-[#10B981] hover:bg-[#0da271] text-white text-sm rounded-lg font-bold disabled:opacity-50"
              >
                Abrir Caixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sangria */}
      {showBleedModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border ${theme.bgCard}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.borderColor}`}>
              <h3 className={`text-base font-semibold flex items-center gap-2 ${theme.textMain}`}>
                <ArrowDownRight className="w-4 h-4 text-red-400" />
                Retirada de Caixa (Sangria)
              </h3>
              <button onClick={() => setShowBleedModal(false)} className={`hover:${theme.textMain} text-sm ${theme.textMuted}`}>✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className={theme.textMuted}>
                Use para qualquer saída de dinheiro do caixa — depósito no cofre, troco entregue, pagamento de despesa mínima em espécie, etc.
              </p>
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Valor a Retirar</label>
                <input
                  type="number"
                  value={bleedAmount}
                  onChange={(e) => setBleedAmount(e.target.value)}
                  placeholder="Ex: 200.00"
                  className={`w-full rounded-lg px-3 py-2 font-mono text-sm border focus:outline-none focus:border-red-400 ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Plano de Contas (Destino do Recurso)</label>
                <select
                  value={bleedAccountPlanId}
                  onChange={(e) => setBleedAccountPlanId(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-red-400 ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
                >
                  <option value="">Não informado</option>
                  {accountPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} - {p.description}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Motivo (opcional)</label>
                <input
                  type="text"
                  value={bleedMotivo}
                  onChange={(e) => setBleedMotivo(e.target.value)}
                  placeholder="Ex: Pagamento de entregador, depósito no cofre..."
                  className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-red-400 ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
                />
              </div>
            </div>

            <div className={`flex justify-end gap-3 pt-3 border-t ${theme.borderColor}`}>
              <button
                onClick={() => setShowBleedModal(false)}
                className={`px-4 py-2 text-sm rounded-lg ${theme.isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteBleed}
                disabled={submitting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-bold disabled:opacity-50"
              >
                Confirmar Retirada
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
