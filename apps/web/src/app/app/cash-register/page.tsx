"use client";

import { useState } from "react";
import { DollarSign, Lock, Unlock, ArrowDownRight, ArrowUpRight, CheckCircle2, ShieldCheck, Printer, FileText } from "lucide-react";

export default function TenantCashRegisterPage() {
  const [isOpen, setIsOpen] = useState(true);
  const [openingBalance, setOpeningBalance] = useState("200.00");
  const [bleedAmount, setBleedAmount] = useState("");
  const [showBleedModal, setShowBleedModal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const [transactions, setTransactions] = useState([
    { id: "TRX-01", time: "08:00", type: "OPENING", description: "Fundo de Troco (Abertura de Caixa)", amount: 200.00, method: "CASH" },
    { id: "TRX-02", time: "09:30", type: "INCOME", description: "Consumo Frigobar Quarto 102 (Pix)", amount: 26.00, method: "PIX" },
    { id: "TRX-03", time: "10:15", type: "INCOME", description: "Diária Hospedagem Avulsa (Cartão Crédito)", amount: 350.00, method: "CREDIT_CARD" },
    { id: "TRX-04", time: "11:00", type: "BLEED", description: "Sangria de Caixa para Cofre Central", amount: -300.00, method: "CASH" },
  ]);

  const totalInCash = 200.00 - 300.00; // 200 fundo - 300 sangria = em dinheiro
  const totalPix = 26.00;
  const totalCredit = 350.00;
  const totalGrand = 276.00;

  const handleExecuteBleed = () => {
    if (!bleedAmount || Number(bleedAmount) <= 0) return;
    const newTrx = {
      id: `TRX-${Math.floor(10 + Math.random() * 90)}`,
      time: new Date().toLocaleTimeString().slice(0, 5),
      type: "BLEED",
      description: "Sangria de Caixa realizada pelo operador",
      amount: -Number(bleedAmount),
      method: "CASH",
    };

    setTransactions([...transactions, newTrx]);
    setShowBleedModal(false);
    setNotification(`Sangria de R$ ${Number(bleedAmount).toFixed(2)} executada com sucesso!`);
    setBleedAmount("");

    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#10B981]" />
            Gestão de Caixa Operacional & Fechamento por Operador
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle de abertura, sangrias, suprimentos de troco, conciliação Pix/Cartão e fechamento cego.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-semibold text-xs flex items-center gap-1.5">
              <Unlock className="w-4 h-4" /> Caixa Aberto (Turno Manhã)
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 font-semibold text-xs flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Caixa Fechado
            </span>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Totals Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-sans font-medium block">Fundo de Abertura</span>
          <span className="text-xl font-bold text-white block">R$ 200,00</span>
          <span className="text-[10px] text-slate-500 font-sans block">Dinheiro em Espécie</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-sans font-medium block">Recebimentos Pix</span>
          <span className="text-xl font-bold text-[#10B981] block">R$ 26,00</span>
          <span className="text-[10px] text-slate-500 font-sans block">Conciliado via QR Code</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-sans font-medium block">Cartão Crédito / Débito</span>
          <span className="text-xl font-bold text-[#0284C7] block">R$ 350,00</span>
          <span className="text-[10px] text-slate-500 font-sans block">Maquininha TEF/POS</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-sans font-medium block">Saldo Total em Caixa</span>
          <span className="text-xl font-bold text-[#38BDF8] block">R$ 276,00</span>
          <span className="text-[10px] text-slate-500 font-sans block">Líquido de Sangrias</span>
        </div>
      </div>

      {/* Action Controls & Transactions Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden space-y-4">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-white">Movimentações do Turno Atual</h3>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBleedModal(true)}
              className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <ArrowDownRight className="w-4 h-4" /> Realizar Sangria
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                alert("Caixa fechado com sucesso! Relatório cego enviado ao gerencial.");
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <Lock className="w-4 h-4 text-red-400" /> Fechar Caixa Cego
            </button>
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
              <th className="p-3.5">HORA / ID</th>
              <th className="p-3.5">DESCRIÇÃO DA MOVIMENTAÇÃO</th>
              <th className="p-3.5">MEIO DE PAGAMENTO</th>
              <th className="p-3.5">VALOR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {transactions.map((trx) => (
              <tr key={trx.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5 font-mono">
                  <span className="text-white font-bold block">{trx.time}</span>
                  <span className="text-[10px] text-slate-500">{trx.id}</span>
                </td>
                <td className="p-3.5 font-medium text-slate-200">{trx.description}</td>
                <td className="p-3.5 font-mono text-slate-300">{trx.method}</td>
                <td className="p-3.5 font-mono font-semibold">
                  {trx.amount > 0 ? (
                    <span className="text-[#10B981]">+ R$ {trx.amount.toFixed(2)}</span>
                  ) : (
                    <span className="text-red-400">R$ {trx.amount.toFixed(2)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Sangria */}
      {showBleedModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-red-400" />
                Sangria de Caixa (Retirada de Dinheiro)
              </h3>
              <button onClick={() => setShowBleedModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Valor a Retirar para Cofre</label>
                <input
                  type="number"
                  value={bleedAmount}
                  onChange={(e) => setBleedAmount(e.target.value)}
                  placeholder="Ex: 200.00"
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-red-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowBleedModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteBleed}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-bold"
              >
                Confirmar Sangria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
