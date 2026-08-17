"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, Lock, Unlock, ArrowDownRight, Loader2, Printer } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useSession } from "@/context/SessionContext";
import { useOperator } from "@/context/OperatorContext";
import { useTheme } from "@/context/ThemeContext";

interface CashTransactionDTO {
  id: string;
  type: string;
  amount: number;
  description: string;
  paymentMethod: string;
  guestName: string | null;
  roomNumber: string | null;
  createdAt: string;
}

interface CashRegisterDTO {
  id: string;
  caixaNumero: number;
  operatorId: string;
  operatorName: string;
  openingBalance: number;
  openedAt: string;
  closedAt: string | null;
  totalDinheiro: number;
  totalPix: number;
  totalCartao: number;
  totalSangrias: number;
  saldoTotal: number;
  transactions: CashTransactionDTO[];
}

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function TenantCashRegisterPage() {
  const toast = useToast();
  const { user } = useSession();
  const { operatorId, operatorName } = useOperator();
  const { hotelName, theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [caixa, setCaixa] = useState<CashRegisterDTO | null>(null);
  const [bleedAmount, setBleedAmount] = useState("");
  const [bleedMotivo, setBleedMotivo] = useState("");
  const [showBleedModal, setShowBleedModal] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingFund, setOpeningFund] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const loadSessao = useCallback(async () => {
    if (!operatorId) return;
    try {
      const params = new URLSearchParams({ operatorId });
      if (user?.tenantId) params.set("tenantId", user.tenantId);
      const res = await fetch(`/api/caixa/sessao?${params.toString()}`);
      const data = await res.json();
      setCaixa(data.success && data.isOpen ? data.caixa : null);
    } catch {
      toast.error("Falha ao carregar dados do caixa.");
    } finally {
      setLoading(false);
    }
  }, [operatorId, user?.tenantId, toast]);

  useEffect(() => {
    loadSessao();
  }, [loadSessao]);

  const handleAbrirCaixa = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/caixa/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: user?.tenantId,
          operatorId,
          operatorName,
          fundoTroco: Number(openingFund) || 0,
        }),
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
          tenantId: user?.tenantId,
          operatorId,
          operatorName,
          valor: Number(bleedAmount),
          motivo: bleedMotivo || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao executar sangria.");
        return;
      }
      toast.success(data.message || "Sangria executada com sucesso!");
      setShowBleedModal(false);
      setBleedAmount("");
      setBleedMotivo("");
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
        body: JSON.stringify({
          tenantId: user?.tenantId,
          operatorId,
          saldoInformado: caixa.saldoTotal,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao fechar caixa.");
        return;
      }
      toast.success(data.message || "Caixa fechado com sucesso!");
      await loadSessao();
    } catch {
      toast.error("Falha ao fechar caixa.");
    } finally {
      setSubmitting(false);
    }
  };

  const isOpen = !!caixa;

  // Linhas do relatório impresso do caixa, no padrão do sistema WinDev original (impressão do
  // caixa.pdf): abertura sempre como primeira linha, cada movimento como Crédito ou Débito.
  const printRows = useMemo(() => {
    if (!caixa) return [];
    const rows: { dataHora: string; descricao: string; credito: number; debito: number }[] = [];
    const abertura = caixa.transactions.find((t) => t.type === "SUPRIMENTO");
    rows.push({
      dataHora: abertura ? abertura.createdAt : caixa.openedAt,
      descricao: "Abertura do caixa",
      credito: abertura ? abertura.amount : caixa.openingBalance,
      debito: 0,
    });
    for (const t of caixa.transactions) {
      if (t.type === "SUPRIMENTO") continue;
      rows.push({
        dataHora: t.createdAt,
        descricao: t.description,
        credito: t.type === "ENTRADA" ? t.amount : 0,
        debito: t.type === "SANGRIA" ? t.amount : 0,
      });
    }
    return rows;
  }, [caixa]);

  // Totais por forma de pagamento (apenas entradas reais, sem contar fundo de troco), somados
  // ao final do relatório — equivalente ao rodapé "CARTAO / PIX / TOTAL CAIXA" do WinDev.
  const printTotalsByMethod = useMemo(() => {
    if (!caixa) return [];
    const totals = new Map<string, number>();
    for (const t of caixa.transactions) {
      if (t.type !== "ENTRADA") continue;
      totals.set(t.paymentMethod, (totals.get(t.paymentMethod) || 0) + t.amount);
    }
    return Array.from(totals.entries());
  }, [caixa]);

  const printTotalCaixa = printTotalsByMethod.reduce((s, [, v]) => s + v, 0);

  const handlePrint = () => {
    setShowPrintPreview(true);
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="space-y-6">
      {/* Print Preview — relatório de impressão do caixa, no padrão do sistema WinDev original.
          Impresso em paisagem para caber todas as colunas (Data/Hora, Descrição, Crédito, Débito,
          Plano de contas) horizontalmente, ao contrário do restante do sistema (retrato). */}
      {showPrintPreview && caixa && (
        <div className="fixed inset-0 bg-white text-black z-[100] p-6 overflow-y-auto print-container print:block hidden font-mono text-xs">
          <style>{`@media print { @page { size: landscape; } }`}</style>
          <div className="pb-1">
            <h1 className="text-base font-bold uppercase tracking-tight">{hotelName || "HOTEL IDEAL"} - 40.904.811/0001-31</h1>
            <p className="text-[11px] text-slate-700">RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614</p>
            <div className="h-1.5 bg-black w-full mt-2 mb-3"></div>
          </div>

          <div className="flex items-center justify-between text-xs mb-1">
            <span><strong>No.Caixa:</strong> {caixa.caixaNumero}</span>
            <span><strong>Página:</strong> 1</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 text-xs mb-3">
            <span><strong>Operador:</strong> {caixa.operatorName}</span>
            <span><strong>Data Abertura:</strong> {fmtDataHora(caixa.openedAt)}</span>
            <span><strong>Data fechamento:</strong> {caixa.closedAt ? fmtDataHora(caixa.closedAt) : "__/__/____ HH:mm:SS"}</span>
          </div>

          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-black font-bold">
                <th className="py-1 pr-2">Data/Hora</th>
                <th className="py-1 pr-2">Descrição</th>
                <th className="py-1 pr-2 text-right">Crédito(R$)</th>
                <th className="py-1 pr-2 text-right">Débito(R$)</th>
                <th className="py-1">Plano de contas</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-300">
                  <td className="py-1 pr-2 whitespace-nowrap">{fmtDataHora(row.dataHora)}</td>
                  <td className="py-1 pr-2">{row.descricao}</td>
                  <td className="py-1 pr-2 text-right">{fmtBRL(row.credito)}</td>
                  <td className="py-1 pr-2 text-right">{fmtBRL(row.debito)}</td>
                  <td className="py-1">Plano de contas não encontrado</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 text-xs max-w-xs">
            {printTotalsByMethod.map(([method, total]) => (
              <div key={method} className="flex justify-between font-semibold">
                <span>{method}</span>
                <span>{fmtBRL(total)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-1 border-t border-black">
              <span>TOTAL CAIXA:</span>
              <span>{fmtBRL(printTotalCaixa)}</span>
            </div>
          </div>
        </div>
      )}

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
                  <ArrowDownRight className="w-4 h-4" /> Realizar Sangria
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
                Sangria de Caixa (Retirada de Dinheiro)
              </h3>
              <button onClick={() => setShowBleedModal(false)} className={`hover:${theme.textMain} text-sm ${theme.textMuted}`}>✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Valor a Retirar para Cofre</label>
                <input
                  type="number"
                  value={bleedAmount}
                  onChange={(e) => setBleedAmount(e.target.value)}
                  placeholder="Ex: 200.00"
                  className={`w-full rounded-lg px-3 py-2 font-mono text-sm border focus:outline-none focus:border-red-400 ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`font-medium ${theme.textMuted}`}>Motivo (opcional)</label>
                <input
                  type="text"
                  value={bleedMotivo}
                  onChange={(e) => setBleedMotivo(e.target.value)}
                  placeholder="Ex: Sangria para cofre central"
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
                Confirmar Sangria
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
