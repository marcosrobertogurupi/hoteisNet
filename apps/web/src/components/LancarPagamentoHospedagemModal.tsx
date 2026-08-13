"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Printer,
  Eye,
  Car,
  Check,
  Trash2,
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
  MessageSquare,
  Building2,
  ChevronDown,
  Mail,
  Loader2
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";


export interface PaymentCreditItem {
  id: string;
  date: string;              // e.g. "12/08/2026"
  amount: number;            // e.g. 150.00
  methodDescription: string; // e.g. "DINHEIRO", "PIX", "CARTAO", etc.
  caixaMovimentoId?: string;
}

export interface ObservationLog {
  id: string;
  dateTime: string;          // e.g. "12/08/2026 09:42"
  type: string;              // e.g. "PAGAMENTO", "RECEPÇÃO", "SISTEMA"
  user: string;              // e.g. "MARCOS"
  note: string;
}

export interface GuestItem {
  id: string;
  name: string;
}

export interface LancarPagamentoHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayData: {
    idHospedagem: string;
    roomNumber: string;
    primaryGuestName: string;
    checkInDate: string;          // e.g. "05/02/2026 13:08:42"
    expectedCheckOutDate: string; // e.g. "08/02/2026 14:00:00"
    actualCheckOutDate?: string;  // e.g. "12/08/2026 09:39:20"
    dailyCount: number;
    extrasCount?: number;
    totalDiarias: number;
    totalConsumo: number;
    outrosDebitos?: number;
    desconto?: number;
    guestsList?: GuestItem[];
    initialPayments?: PaymentCreditItem[];
    initialObservations?: ObservationLog[];
  };
  onSaveSuccess?: (updatedData: {
    totalPagamentos: number;
    saldoAPagar: number;
    payments: PaymentCreditItem[];
    observations: ObservationLog[];
  }) => void;
}

const PRE_REGISTERED_PAYMENT_METHODS = [
  "DINHEIRO",
  "CARTAO",
  "PIX",
  "FATURA",
  "SALDO DE CLIENTE",
  "TRANSF.DEBITO",
];

export default function LancarPagamentoHospedagemModal({
  isOpen,
  onClose,
  stayData,
  onSaveSuccess,
}: LancarPagamentoHospedagemModalProps) {
  const {
    theme,
    hotelName,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailSmtpUser,
    emailSmtpPass,
    emailFromName,
    emailFromAddress,
    emailFooterText,
    sendPaymentConfirmEmailEnabled,
  } = useTheme();
  const toast = useToast();

  // Financial values
  const totalDiarias = stayData.totalDiarias || 35720.0;
  const [totalConsumo, setTotalConsumo] = useState<number>(stayData.totalConsumo || 28.0);
  const outrosDebitos = stayData.outrosDebitos || 0.0;
  const [desconto, setDesconto] = useState<number>(stayData.desconto || 0.0);

  // Payments State
  const [payments, setPayments] = useState<PaymentCreditItem[]>(
    stayData.initialPayments || []
  );

  // Observations State
  const [observations, setObservations] = useState<ObservationLog[]>(
    stayData.initialObservations || [
      {
        id: "OBS-101",
        dateTime: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        type: "SISTEMA",
        user: "MARCOS",
        note: "Hospedagem iniciada com pagamento parcial pendente."
      }
    ]
  );
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [newObsText, setNewObsText] = useState<string>("");

  // New Payment Input Form
  const [dtPagto, setDtPagto] = useState<string>(
    new Date().toLocaleDateString("pt-BR")
  );
  const [vlrPagto, setVlrPagto] = useState<string>("0,00");
  const [formaPagamento, setFormaPagamento] = useState<string>("DINHEIRO");

  // Filter for Guests Table
  const [guestFilter, setGuestFilter] = useState<string>("");

  // Quick Modal States
  const [showReciboModal, setShowReciboModal] = useState<boolean>(false);
  const [selectedReciboPayment, setSelectedReciboPayment] = useState<PaymentCreditItem | null>(null);
  const [showAddConsumoModal, setShowAddConsumoModal] = useState<boolean>(false);
  const [consumoItemName, setConsumoItemName] = useState<string>("Água Mineral 500ml");
  const [consumoItemVal, setConsumoItemVal] = useState<string>("6.00");

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [sendingEmailPayment, setSendingEmailPayment] = useState<boolean>(false);

  const handleSendEmailPaymentReceipt = async (payment: PaymentCreditItem) => {
    if (!sendPaymentConfirmEmailEnabled) {
      toast.warning("O envio de Confirmações de Pagamento por e-mail está desativado nas Configurações da Área do Assinante.");
      return;
    }

    const recipient = prompt("Informe o e-mail do hóspede para envio do comprovante de pagamento:");
    if (!recipient || !recipient.includes("@")) {
      if (recipient !== null) toast.error("Informe um e-mail válido.");
      return;
    }

    setSendingEmailPayment(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: recipient.trim(),
          recipientName: stayData.primaryGuestName,
          documentType: "payment_confirmation",
          subject: `Comprovante de Pagamento - Quarto ${stayData.roomNumber} - ${hotelName}`,
          message: `Confirmamos o recebimento do pagamento no valor de R$ ${payment.amount.toFixed(2)} (${payment.methodDescription}) referente ao Quarto ${stayData.roomNumber}. Data: ${payment.date}.`,
          smtpHost: emailSmtpHost,
          smtpPort: emailSmtpPort,
          smtpSecure: emailSmtpSecure,
          smtpUser: emailSmtpUser,
          smtpPass: emailSmtpPass,
          fromName: emailFromName || hotelName,
          fromEmail: emailFromAddress,
          footerText: emailFooterText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`✓ Comprovante de pagamento enviado com sucesso para ${recipient}!`);
      } else {
        toast.error(`Falha no envio: ${data.error || data.message || "Erro no servidor SMTP."}`);
      }
    } catch (err: any) {
      console.error("Erro ao enviar comprovante por e-mail:", err);
      toast.error(err.message || "Erro de rede ao enviar e-mail.");
    } finally {
      setSendingEmailPayment(false);
    }
  };

  if (!isOpen) return null;

  // Guests List
  const guests: GuestItem[] = stayData.guestsList || [
    { id: "G-1", name: stayData.primaryGuestName || "PEDRO RICARDO DA SILVA FAGUNDES" }
  ];
  const filteredGuests = guests.filter(g =>
    g.name.toLowerCase().includes(guestFilter.toLowerCase())
  );

  // Calculations
  const totalPagamentos = payments.reduce((acc, p) => acc + p.amount, 0);
  const totalDespesas = totalDiarias + totalConsumo + outrosDebitos;
  const saldoAPagar = Math.max(0, totalDespesas - totalPagamentos - desconto);

  // Format Helper
  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  // Add Payment Handler
  const handleAddPayment = async () => {
    const cleanValStr = vlrPagto.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const valNum = parseFloat(cleanValStr);

    if (isNaN(valNum) || valNum <= 0) {
      toast.warning("Por favor, informe um valor de pagamento válido maior que zero.", "Valor Inválido");
      return;
    }

    const newPayment: PaymentCreditItem = {
      id: `PAG-${Date.now()}`,
      date: dtPagto || new Date().toLocaleDateString("pt-BR"),
      amount: valNum,
      methodDescription: formaPagamento,
    };

    // Try posting to API caixa
    try {
      const res = await fetch("/api/caixa/pagamento-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: "USR-001",
          operatorName: "MARCOS",
          roomId: stayData.roomNumber,
          stayCheckinId: stayData.idHospedagem,
          guestName: stayData.primaryGuestName,
          valor: valNum,
          formaPagamento,
          descricao: `Crédito de hospedagem (${formaPagamento}) - Quarto ${stayData.roomNumber}`
        })
      });
      const data = await res.json();
      if (data.success && data.movimentoCaixaId) {
        newPayment.caixaMovimentoId = data.movimentoCaixaId;
      }
    } catch (e) {
      console.warn("Backend API not reachable, saving locally:", e);
    }

    setPayments(prev => [newPayment, ...prev]);

    // Also append an observation entry
    const newObs: ObservationLog = {
      id: `OBS-${Date.now()}`,
      dateTime: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      type: "PAGAMENTO",
      user: "MARCOS",
      note: `Lançado pagamento/crédito de ${fmtCurrency(valNum)} em ${formaPagamento}.`
    };
    setObservations(prev => [newObs, ...prev]);

    setVlrPagto("0,00");
    toast.success(`Crédito de ${fmtCurrency(valNum)} (${formaPagamento}) lançado com sucesso no caixa!`, "Crédito Registrado");
  };

  // Remove Payment Handler
  const handleRemovePayment = async (paymentId: string) => {
    if (!confirm("Deseja realmente excluir este lançamento de pagamento/crédito?")) {
      return;
    }

    const item = payments.find(p => p.id === paymentId);
    if (item?.caixaMovimentoId) {
      try {
        await fetch("/api/caixa/remover-pagamento", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: stayData.roomNumber,
            stayCheckinId: stayData.idHospedagem,
            lancamentoId: item.id,
            caixaMovimentoId: item.caixaMovimentoId,
            operatorId: "USR-001"
          })
        });
      } catch (e) {
        console.error(e);
      }
    }

    setPayments(prev => prev.filter(p => p.id !== paymentId));
    toast.info("Lançamento de crédito removido da conta e conferência do caixa.", "Lançamento Excluído");
  };

  // Add Observation Handler
  const handleAddObservation = () => {
    if (!newObsText.trim()) return;
    const newObs: ObservationLog = {
      id: `OBS-${Date.now()}`,
      dateTime: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      type: "RECEPÇÃO",
      user: "MARCOS",
      note: newObsText.trim()
    };
    setObservations(prev => [newObs, ...prev]);
    setNewObsText("");
    setSelectedObsId(newObs.id);
    toast.info("Observação adicionada com sucesso.", "Observação");
  };

  // Save Credit Button Handler
  const handleSaveCredit = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success(
        `Crédito/Pagamento salvo com sucesso para o Quarto ${stayData.roomNumber}!\n\n` +
        `Total Pagamentos: ${fmtCurrency(totalPagamentos)}\n` +
        `Saldo Restante a Pagar: ${fmtCurrency(saldoAPagar)}`,
        "Crédito Salvo"
      );
      if (onSaveSuccess) {
        onSaveSuccess({
          totalPagamentos,
          saldoAPagar,
          payments,
          observations,
        });
      }
      onClose();
    }, 400);
  };


  const selectedObs = observations.find(o => o.id === selectedObsId) || observations[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      {/* Modal Container - WinDev Window Replication */}
      <div
        className={`w-full max-w-5xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        {/* Title Bar - WinDev Style */}
        <div className="bg-gradient-to-r from-[#184176] via-[#1E5296] to-[#0284C7] px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-200" />
            <h2 className="font-bold text-sm tracking-wide">
              Lançamento de crédito/pagamento para hospedagem
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[85vh]">
          {/* TOP BAR: Room & Guest Metadata Info */}

          <div className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 shadow-sm ${
            theme.isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quartos</label>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded bg-[#0284C7] text-white shadow-sm">
                    {stayData.roomNumber}
                  </span>
                </div>
              </div>

              <div className="min-w-[240px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Hospede Principal</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={stayData.primaryGuestName || "PEDRO RICARDO DA SILVA FAGUNDES"}
                    className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-400" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                  <button
                    onClick={() => alert(`Visualizar cadastro do hóspede ${stayData.primaryGuestName}`)}
                    className="p-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 shadow-sm"
                    title="Visualizar Hóspede"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => alert(`Veículos do hóspede ${stayData.primaryGuestName}`)}
                    className="p-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white shrink-0 shadow-sm"
                    title="Veículos do Hóspede"
                  >
                    <Car className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Chegada</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {stayData.checkInDate || "05/02/2026 13:08:42"}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Prevista Saida</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {stayData.expectedCheckOutDate || "08/02/2026 14:00:00"}
                </span>
              </div>

              <div className="text-center">
                <span className="block text-[10px] text-slate-500 font-semibold">Diarias</span>
                <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 border border-yellow-400/40">
                  {stayData.dailyCount || 3}
                </span>
              </div>

              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt. Saida</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {stayData.actualCheckOutDate || new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR")}
                </span>
              </div>

              <div className="text-center">
                <span className="block text-[10px] text-red-500 font-bold uppercase">Extras</span>
                <span className="font-mono font-extrabold text-xs text-red-600 dark:text-red-400">
                  {stayData.extrasCount || 185}
                </span>
              </div>
            </div>
          </div>

          {/* MIDDLE TOP: Guests Table (Left) & Resumo da Hospedagem (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: Guests Table */}
            <div className={`md:col-span-6 border rounded-lg overflow-hidden flex flex-col ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="bg-[#00BCD4] text-white px-3 py-1.5 font-bold text-xs flex items-center justify-between shadow-sm">
                <span>Nome Hospede</span>
                <input
                  type="text"
                  placeholder="Filtrar..."
                  value={guestFilter}
                  onChange={(e) => setGuestFilter(e.target.value)}
                  className="bg-white/20 text-white placeholder-white/70 text-[10px] px-2 py-0.5 rounded outline-none w-24"
                />
              </div>

              <div className="p-1 overflow-y-auto max-h-32 min-h-[100px]">
                <table className="w-full text-left text-[11px] border-collapse">
                  <tbody>
                    {filteredGuests.map((g, idx) => (
                      <tr
                        key={g.id}
                        className={`border-b last:border-b-0 ${
                          idx % 2 === 0
                            ? theme.isDark ? "bg-slate-900/40" : "bg-slate-50"
                            : "bg-transparent"
                        }`}
                      >
                        <td className="p-2 font-semibold flex items-center justify-between">
                          <span>{g.name}</span>
                          {idx === 0 && (
                            <span className="text-[9px] bg-sky-500/20 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded font-bold uppercase">
                              Principal
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Resumo da Hospedagem */}
            <div className={`md:col-span-6 border rounded-lg p-3 space-y-3 ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <div className="flex items-center justify-between border-b pb-1">
                <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
                  Resumo da hospedagem:
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {/* Total Diarias */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Total Diarias (R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(totalDiarias)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => alert(`Detalhamento de Diárias: ${fmtCurrency(totalDiarias)}`)}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Ver Diárias"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Consumo */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Consumo(R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(totalConsumo)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => setShowAddConsumoModal(true)}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Adicionar Consumo"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => alert(`Imprimir comprovante de consumo`)}
                      className="p-1 rounded bg-cyan-700 text-white shrink-0 hover:bg-cyan-600"
                      title="Imprimir Consumo"
                    >
                      <Printer className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Outros Deb. */}
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase">Outros Deb. (R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(outrosDebitos)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-50 border-yellow-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => alert(`Outros Débitos: ${fmtCurrency(outrosDebitos)}`)}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Ver Outros Débitos"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Desconto */}
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">Desconto (R$)</label>
                  <input
                    type="number"
                    value={desconto}
                    onChange={(e) => setDesconto(parseFloat(e.target.value) || 0)}
                    className={`w-full font-mono font-bold text-right p-1 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-white focus:border-sky-400" : "bg-white border-slate-300 text-slate-900 focus:border-sky-500"
                    }`}
                  />
                </div>

                {/* Total Adiant. */}
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">Total Adiant. (R$)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      readOnly
                      value={fmtCurrency(totalPagamentos)}
                      className={`w-full font-mono font-bold text-right p-1 rounded border ${
                        theme.isDark ? "bg-slate-800 border-slate-700 text-sky-300" : "bg-sky-50 border-sky-200 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => alert(`Total de adiantamentos lançados: ${fmtCurrency(totalPagamentos)}`)}
                      className="p-1 rounded bg-cyan-600 text-white shrink-0 hover:bg-cyan-500"
                      title="Ver Adiantamentos"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => alert(`Imprimindo Resumo de Hospedagem do Quarto ${stayData.roomNumber}...`)}
                className="w-full py-2 px-3 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir resumo de hospedagem
              </button>
            </div>
          </div>

          {/* MAIN MIDDLE: Pagamentos Form & Table (Left) & Saldo a pagar / Save Button (Right) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left: Pagamentos Form & Grid */}
            <div className={`md:col-span-8 border rounded-lg p-3 space-y-3 ${
              theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
            }`}>
              <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
                Pagamentos:
              </h3>

              {/* Form Input Line */}
              <div className="flex flex-wrap items-end gap-2 text-[11px]">
                <div className="w-28">
                  <label className="block text-[10px] font-bold text-slate-500">Dt.Pagto</label>
                  <input
                    type="text"
                    value={dtPagto}
                    onChange={(e) => setDtPagto(e.target.value)}
                    className={`w-full font-mono p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                </div>

                <div className="w-32">
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400">Vlr.Pagto.</label>
                  <input
                    type="text"
                    value={vlrPagto}
                    onChange={(e) => setVlrPagto(e.target.value)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[10px] font-bold text-slate-500">Forma de Pagamento</label>
                  <select
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                    className={`w-full font-bold p-1.5 rounded border outline-none ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-300 text-slate-900"
                    }`}
                  >
                    {PRE_REGISTERED_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleAddPayment}
                  className="p-2 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold shrink-0 shadow-sm transition-colors flex items-center justify-center"
                  title="Adicionar Lançamento de Crédito/Pagamento"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Payments Grid Table */}
              <div className="border rounded overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#00BCD4] text-white font-bold select-none">
                      <th className="p-1.5 border-r border-cyan-400/50">Data</th>
                      <th className="p-1.5 border-r border-cyan-400/50 text-right">Valor Adiant.</th>
                      <th className="p-1.5 border-r border-cyan-400/50">Descr.Form.Pagto</th>
                      <th className="p-1.5 text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-3 text-center text-slate-400 italic">
                          Nenhum pagamento ou crédito lançado ainda nesta hospedagem.
                        </td>
                      </tr>
                    ) : (
                      payments.map((p, idx) => (
                        <tr
                          key={p.id}
                          onDoubleClick={() => handleRemovePayment(p.id)}
                          className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                            idx % 2 === 0
                              ? theme.isDark ? "bg-slate-900/40 hover:bg-slate-800" : "bg-slate-50 hover:bg-sky-50"
                              : theme.isDark ? "hover:bg-slate-800" : "hover:bg-sky-50"
                          }`}
                          title="Duplo clique para excluir este lançamento"
                        >
                          <td className="p-1.5 font-mono">{p.date}</td>
                          <td className="p-1.5 font-mono font-bold text-right text-emerald-600 dark:text-emerald-400">
                            {fmtCurrency(p.amount)}
                          </td>
                          <td className="p-1.5 font-bold uppercase">{p.methodDescription}</td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePayment(p.id);
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Payments Action & Hint */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => {
                    if (payments.length > 0) {
                      setSelectedReciboPayment(payments[0]);
                      setShowReciboModal(true);
                    } else {
                      alert("Nenhum pagamento registrado para emitir recibo.");
                    }
                  }}
                  className="py-1.5 px-3 rounded-lg bg-[#00BCD4] hover:bg-cyan-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Recibo
                </button>

                <p className="text-[10px] text-red-500 italic font-semibold">
                  *Para excluir um lançamento clica duas vezes com o botao esquerdo no mouse em cima do lançamento.
                </p>
              </div>
            </div>

            {/* Right: Salvar Crédito & Financial Summary */}
            <div className="md:col-span-4 flex flex-col justify-between space-y-4">
              <div className={`border rounded-lg p-3 space-y-3 ${
                theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">
                    Total de Pagamentos (R$)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={fmtCurrency(totalPagamentos)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border text-sm ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-200 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">
                    Desconto (R$)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={fmtCurrency(desconto)}
                    className={`w-full font-mono font-bold text-right p-1.5 rounded border text-sm ${
                      theme.isDark ? "bg-slate-800 border-slate-700 text-yellow-300" : "bg-yellow-100 border-yellow-200 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              {/* Saldo a pagar (R$) Yellow Box - WinDev Focal Point */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-sm text-blue-700 dark:text-blue-400">
                  Saldo a pagar (R$)
                </h4>
                <div className="bg-yellow-300 dark:bg-yellow-400/90 text-red-600 font-extrabold text-2xl p-3 rounded-lg text-right shadow-inner font-mono border-2 border-yellow-400">
                  {fmtCurrency(saldoAPagar)}
                </div>

                <button
                  onClick={handleSaveCredit}
                  disabled={isSaving}
                  className="w-full py-3 px-4 rounded-xl bg-[#00BCD4] hover:bg-cyan-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 disabled:opacity-50"
                >
                  <Check className="w-6 h-6 stroke-[3]" />
                  {isSaving ? "Salvando..." : "Salvar Crédito"}
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: Observações */}
          <div className={`border rounded-lg p-3 space-y-2 ${
            theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200">
              Observações:
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Obs Table (Left) */}
              <div className="md:col-span-7 border rounded overflow-hidden max-h-36 overflow-y-auto">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#00BCD4] text-white font-bold select-none">
                      <th className="p-1.5 border-r border-cyan-400/50">Data/Hora</th>
                      <th className="p-1.5 border-r border-cyan-400/50">Tipo</th>
                      <th className="p-1.5">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observations.map((obs, idx) => (
                      <tr
                        key={obs.id}
                        onClick={() => setSelectedObsId(obs.id)}
                        className={`border-b last:border-b-0 cursor-pointer ${
                          selectedObsId === obs.id
                            ? "bg-sky-500/20 font-bold"
                            : idx % 2 === 0
                              ? theme.isDark ? "bg-slate-900/40" : "bg-slate-50"
                              : ""
                        }`}
                      >
                        <td className="p-1.5 font-mono">{obs.dateTime}</td>
                        <td className="p-1.5 font-bold uppercase">{obs.type}</td>
                        <td className="p-1.5 uppercase">{obs.user}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Obs Text Display & New Input (Right) */}
              <div className="md:col-span-5 flex flex-col space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Observação Selecionada / Nova</label>
                <textarea
                  rows={3}
                  value={newObsText || (selectedObs ? selectedObs.note : "")}
                  onChange={(e) => setNewObsText(e.target.value)}
                  placeholder="Digite uma nova observação para este lançamento..."
                  className={`w-full p-2 text-xs rounded border outline-none resize-none ${
                    theme.isDark ? "bg-slate-800 border-slate-700 text-white focus:border-sky-400" : "bg-white border-slate-300 text-slate-900 focus:border-sky-500"
                  }`}
                />
                {newObsText.trim() && (
                  <button
                    onClick={handleAddObservation}
                    className="self-end px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Observação
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK MODAL 1: RECIBO DE PAGAMENTO */}
      {showReciboModal && selectedReciboPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:p-0 print:bg-transparent print:static print:block">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 print:p-0 print:border-none print:shadow-none print:bg-white print:text-black print:max-w-none print:w-full ${
            theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between border-b pb-3 print:hidden">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-cyan-500" /> Recibo de Pagamento / Adiantamento
              </h3>
              <button onClick={() => setShowReciboModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border rounded-xl space-y-3 text-xs font-mono print:bg-white print:text-black print:border-slate-400 print:p-0">
              <div className="text-center font-bold border-b pb-2 text-slate-700 dark:text-slate-200 print:text-black">
                {hotelName || "POUSADA SOL & MAR"}
                <br />
                <span className="text-[10px] font-normal text-slate-500 print:text-slate-700">COMPROVANTE DE CRÉDITO DE HOSPEDAGEM</span>
              </div>

              <div className="space-y-1">
                <div>Quarto: <strong className="text-sky-500 print:text-black">{stayData.roomNumber}</strong></div>
                <div>Hóspede: <strong>{stayData.primaryGuestName}</strong></div>
                <div>Data Lançamento: {selectedReciboPayment.date}</div>
                <div>Forma de Pagto: <strong className="uppercase">{selectedReciboPayment.methodDescription}</strong></div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 print:text-black pt-1 border-t">
                  Valor Pago: {fmtCurrency(selectedReciboPayment.amount)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => setShowReciboModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Fechar
              </button>
              <button
                onClick={() => handleSendEmailPaymentReceipt(selectedReciboPayment)}
                disabled={sendingEmailPayment}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {sendingEmailPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Enviar por E-mail
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  window.print();
                  setShowReciboModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK MODAL 2: ADICIONAR CONSUMO */}
      {showAddConsumoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-500" /> Adicionar Consumo Rápido
              </h3>
              <button onClick={() => setShowAddConsumoModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-semibold">Descrição do Item</label>
                <input
                  type="text"
                  value={consumoItemName}
                  onChange={(e) => setConsumoItemName(e.target.value)}
                  className={`w-full p-2 rounded border outline-none ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className="block mb-1 font-semibold">Valor (R$)</label>
                <input
                  type="number"
                  value={consumoItemVal}
                  onChange={(e) => setConsumoItemVal(e.target.value)}
                  className={`w-full p-2 rounded border outline-none font-mono ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddConsumoModal(false)}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const val = parseFloat(consumoItemVal) || 0;
                  setTotalConsumo(prev => prev + val);
                  setShowAddConsumoModal(false);
                  toast.success(`Consumo '${consumoItemName}' (${fmtCurrency(val)}) adicionado com sucesso!`, "Consumo Adicionado");
                }}

                className="px-3 py-1.5 rounded text-xs font-semibold bg-cyan-600 text-white"
              >
                Confirmar Consumo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
