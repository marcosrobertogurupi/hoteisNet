"use client";

import { useState } from "react";
import { CreditCard, Building2, CheckCircle2, DollarSign, FileText, Printer, ArrowRight, ShieldCheck, UserCheck } from "lucide-react";
import { useToast } from "@/context/ToastContext";

export default function TenantCheckoutPage() {
  const toast = useToast();
  const [selectedRoomNumber, setSelectedRoomNumber] = useState("102");
  const [billingOption, setBillingOption] = useState<"DIRECT" | "CORPORATE" | "MIXED">("CORPORATE");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [corporateCompany, setCorporateCompany] = useState("Tech Corp Consultoria LTDA");
  const [isCompleted, setIsCompleted] = useState(false);

  // Sample Account Details for Checkout
  const accountSummary = {
    roomNumber: "102",
    guestName: "Marcos Oliveira",
    companyName: "Tech Corp Consultoria LTDA",
    cnpjCompany: "12.345.678/0001-90",
    checkInDate: "10/08/2026",
    checkOutDate: "14/08/2026 (Hoje)",
    dailyRatesCount: 4,
    dailyRatePrice: 350.00,
    totalDailyAmount: 1400.00,
    consumptions: [
      { description: "Água Mineral 500ml (2x)", amount: 12.00 },
      { description: "Cerveja Heineken Long Neck (1x)", amount: 14.00 },
      { description: "Serviço de Lavanderia Express", amount: 50.00 },
    ],
    totalConsumptionAmount: 76.00,
    depositPaid: 350.00, // Sinal pago na reserva
    totalGrandAmount: 1126.00, // 1400 + 76 - 350
  };

  const handleFinishCheckout = () => {
    setIsCompleted(true);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#10B981]" />
            Fechamento de Conta & Check-out Flexível (Faturamento Corporativo)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Encerramento de hospedagem, divisão de despesas, emissão de faturas corporativas a prazo e quitação.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-300">Apartamento em Encerramento:</label>
          <select
            value={selectedRoomNumber}
            onChange={(e) => setSelectedRoomNumber(e.target.value)}
            className="bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-[#10B981]"
          >
            <option value="102">Quarto 102 - Marcos Oliveira (Tech Corp)</option>
            <option value="203">Quarto 203 - João (Vale S.A.)</option>
          </select>
        </div>
      </div>

      {isCompleted ? (
        /* Receipt & Confirmation */
        <div className="p-8 rounded-2xl bg-[#0F172A] border border-[#10B981]/40 text-center space-y-6 max-w-2xl mx-auto shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] mx-auto animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">Check-out Concluído com Sucesso!</h3>
            <p className="text-sm text-slate-400">
              O Quarto 102 foi liberado e encaminhado para a <span className="text-[#F59E0B] font-semibold">Governança (Limpeza Pós Checkout)</span>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#1E293B]/70 border border-slate-800 text-xs text-left space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Forma de Quitação:</span>
              <span className="font-bold text-[#38BDF8]">
                {billingOption === "CORPORATE" ? "FATURADO PARA EMPRESA (Contas a Receber)" : "PAGAMENTO DIRETO NA RECEPÇÃO"}
              </span>
            </div>
            {billingOption === "CORPORATE" && (
              <div className="flex justify-between text-[#10B981]">
                <span>Fatura Corporativa Gerada:</span>
                <span className="font-bold">FAT-2026-0049 (Vencimento em 15 dias)</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-700 text-white font-bold text-sm">
              <span>Valor Total Liquidado:</span>
              <span>R$ {accountSummary.totalGrandAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setIsCompleted(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700"
            >
              Voltar ao Checkout
            </button>
            <button
              onClick={() => toast.info("Imprimindo Extrato de Encerramento e Fatura...")}
              className="px-6 py-2 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir Extrato & Fatura
            </button>
          </div>
        </div>
      ) : (
        /* Checkout Account Details & Billing Selector Grid */
        <div className="grid md:grid-cols-3 gap-6">
          {/* Account Statement (Extrato de Despesas) */}
          <div className="md:col-span-2 rounded-2xl bg-[#0F172A] border border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-xs text-[#0284C7] font-mono font-semibold">EXTRATO DE HOSPEDAGEM • QUARTO 102</span>
                <h3 className="text-lg font-bold text-white">{accountSummary.guestName}</h3>
                <span className="text-xs text-slate-400 block mt-0.5">Empresa Vinculada: {accountSummary.companyName}</span>
              </div>
              <div className="text-right font-mono text-xs text-slate-400">
                <span>Período: {accountSummary.checkInDate} a {accountSummary.checkOutDate}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">Discriminação das Despesas</span>

              <div className="space-y-2">
                {/* Diárias */}
                <div className="p-3 rounded-xl bg-[#1E293B]/60 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-white block">Diárias de Hospedagem ({accountSummary.dailyRatesCount} diárias)</span>
                    <span className="text-[11px] text-slate-400">Valor unitário: R$ {accountSummary.dailyRatePrice.toFixed(2)}</span>
                  </div>
                  <span className="font-mono font-bold text-white">R$ {accountSummary.totalDailyAmount.toFixed(2)}</span>
                </div>

                {/* Consumos */}
                {accountSummary.consumptions.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[#1E293B]/40 border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-200">{item.description}</span>
                    <span className="font-mono text-slate-200">R$ {item.amount.toFixed(2)}</span>
                  </div>
                ))}

                {/* Sinal de Reserva Abatido */}
                <div className="p-3 rounded-xl bg-[#10B981]/10 border border-[#10B981]/30 flex items-center justify-between text-xs text-[#10B981]">
                  <span>Sinal de Reserva Pago no Ato (Abatimento)</span>
                  <span className="font-mono font-bold">- R$ {accountSummary.depositPaid.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Total Balance */}
            <div className="p-4 rounded-xl bg-[#1E293B] border border-slate-700 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Saldo Devedor Líquido a Encerrar:</span>
              <span className="text-xl font-bold font-mono text-[#10B981]">R$ {accountSummary.totalGrandAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment & Corporate Billing Selector */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[#10B981]" />
                Opção de Faturamento / Quitação
              </h3>

              {/* Billing Method Radios */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setBillingOption("CORPORATE")}
                  className={`w-full p-3 rounded-xl border text-left transition-all space-y-1 ${
                    billingOption === "CORPORATE"
                      ? "border-[#0284C7] bg-[#0284C7]/15 text-white"
                      : "border-slate-800 bg-[#1E293B]/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs">
                    <span className="flex items-center gap-1.5 text-white">
                      <Building2 className="w-4 h-4 text-[#38BDF8]" /> Faturar para Empresa Conveniada
                    </span>
                    {billingOption === "CORPORATE" && <CheckCircle2 className="w-4 h-4 text-[#38BDF8]" />}
                  </div>
                  <p className="text-[11px] opacity-80">Transfere saldo total para o Contas a Receber da Empresa (Vencimento 15 dias)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingOption("DIRECT")}
                  className={`w-full p-3 rounded-xl border text-left transition-all space-y-1 ${
                    billingOption === "DIRECT"
                      ? "border-[#10B981] bg-[#10B981]/15 text-white"
                      : "border-slate-800 bg-[#1E293B]/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs">
                    <span className="flex items-center gap-1.5 text-white">
                      <CreditCard className="w-4 h-4 text-[#10B981]" /> Pagamento Direto no Balcão
                    </span>
                    {billingOption === "DIRECT" && <CheckCircle2 className="w-4 h-4 text-[#10B981]" />}
                  </div>
                  <p className="text-[11px] opacity-80">Quitação imediata via Pix, Cartão de Crédito/Débito ou Dinheiro</p>
                </button>

                <button
                  type="button"
                  onClick={() => setBillingOption("MIXED")}
                  className={`w-full p-3 rounded-xl border text-left transition-all space-y-1 ${
                    billingOption === "MIXED"
                      ? "border-[#F59E0B] bg-[#F59E0B]/15 text-white"
                      : "border-slate-800 bg-[#1E293B]/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs">
                    <span className="flex items-center gap-1.5 text-white">
                      <FileText className="w-4 h-4 text-[#F59E0B]" /> Faturamento Misto (Diárias Empresa + Consumo Hóspede)
                    </span>
                    {billingOption === "MIXED" && <CheckCircle2 className="w-4 h-4 text-[#F59E0B]" />}
                  </div>
                  <p className="text-[11px] opacity-80">Empresa paga diárias a prazo e hóspede acerta consumo no ato</p>
                </button>
              </div>

              {/* Direct Payment Selector if DIRECT or MIXED */}
              {billingOption !== "CORPORATE" && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="text-xs font-medium text-slate-300">Meio de Pagamento Imediato</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#10B981]"
                  >
                    <option value="PIX">Pix Instantâneo (QR Code)</option>
                    <option value="CREDIT_CARD">Cartão de Crédito</option>
                    <option value="DEBIT_CARD">Cartão de Débito</option>
                    <option value="CASH">Dinheiro em Espécie</option>
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={handleFinishCheckout}
              className="w-full py-3 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-[#10B981]/20 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" /> Finalizar Check-out & Encerrar Conta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
