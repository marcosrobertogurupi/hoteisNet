"use client";

import React, { useState } from "react";
import {
  X,
  Printer,
  Mail,
  MessageSquare,
  Building2,
  User,
  Calendar,
  DollarSign,
  FileText,
  Loader2,
  Phone,
  Send,
  Check,
  RefreshCw
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { generateReservaPdfBase64, PdfReservaData } from "@/utils/pdfGenerator";
import { ReservationItem } from "@/components/ReservationGridMap";

interface VisualizarReservaModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: ReservationItem | null;
  onEdit?: (reservation: ReservationItem) => void;
}

export const VisualizarReservaModal: React.FC<VisualizarReservaModalProps> = ({
  isOpen,
  onClose,
  reservation,
  onEdit,
}) => {
  const {
    theme,
    hotelName,
    defaultCheckInTime,
    defaultCheckOutTime,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailSmtpUser,
    emailSmtpPass,
    emailFromName,
    emailFromAddress,
    emailFooterText,
    sendVoucherEmailEnabled,
  } = useTheme();

  const hotelCnpj = "40.904.811/0001-31";
  const hotelAddress = "RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614";
  const toast = useToast();

  const [loadingSendWpp, setLoadingSendWpp] = useState(false);
  const [loadingSendEmail, setLoadingSendEmail] = useState(false);

  // Modal de Envio por E-mail (Popup dedicado)
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!isOpen || !reservation) return null;

  // Helper formatting dates
  const formatDateBr = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // Calculate total nights
  const calcNights = () => {
    try {
      const d1 = new Date(reservation.checkInDate);
      const d2 = new Date(reservation.checkOutDate);
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    } catch (e) {
      return 1;
    }
  };

  const totalNights = calcNights();
  const balanceDue = Math.max(0, (reservation.totalAmount || 0) - (reservation.depositPaid || 0));

  // Build PDF Voucher Data
  const buildPdfData = (): PdfReservaData => {
    const checkInFmt = `${formatDateBr(reservation.checkInDate)} ${reservation.checkInTime || defaultCheckInTime || "14:00"}:00`;
    const checkOutFmt = `${formatDateBr(reservation.checkOutDate)} ${reservation.checkOutTime || defaultCheckOutTime || "12:00"}:00`;
    const netTotal = Math.max(0, (reservation.totalAmount || 0) - (reservation.depositPaid || 0));

    return {
      hotelName: hotelName || "Pousada Sol & Mar",
      hotelCnpj,
      hotelAddress,
      reservationNumber: reservation.id || "RES-001",
      issueDate: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR").slice(0, 5),
      roomNumber: reservation.roomId || "101",
      roomDescription: `Quarto ${reservation.roomId || "101"}`,
      roomCategory: "STANDARD SUPERIOR",
      roomFloor: "1º ANDAR",
      tariffName: reservation.company || "TARIFA PADRÃO",
      adults: 1,
      children: 0,
      guestName: reservation.guestName || "HÓSPEDE",
      guestCpf: reservation.cpf || "-",
      guestPhone: reservation.phone || "-",
      checkInDate: checkInFmt,
      checkOutDate: checkOutFmt,
      dailyRows: [
        {
          dtReserva: formatDateBr(reservation.checkInDate),
          dtFinal: formatDateBr(reservation.checkOutDate),
          diaria: reservation.dailyRate || 0,
        },
      ],
      totals: {
        totalDiarias: reservation.totalAmount || 0,
        totalAdiantamento: reservation.depositPaid || 0,
        desconto: 0,
        totalLiquido: netTotal,
      },
      payments: reservation.depositPaid
        ? [
            {
              paymentDate: formatDateBr(reservation.checkInDate),
              amount: reservation.depositPaid,
              paymentMethod: "ADIANTAMENTO RESERVA",
            },
          ]
        : [],
      notes: reservation.notes || "",
    };
  };

  // 1. AÇÃO: IMPRIMIR VOUCHER DE RESERVA
  const handlePrintVoucher = () => {
    try {
      const pdfData = buildPdfData();
      const pdfBase64 = generateReservaPdfBase64(pdfData);

      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${pdfBase64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
        win.document.title = `Voucher_Reserva_${reservation.id}`;
      } else {
        toast.info("Pop-up bloqueado. Baixando PDF...");
        const link = document.createElement("a");
        link.href = pdfBase64;
        link.download = `Voucher_Reserva_${reservation.id}.pdf`;
        link.click();
      }
    } catch (err) {
      console.error("Erro ao gerar PDF para impressão:", err);
      toast.error("Erro ao gerar voucher para impressão.");
    }
  };

  // 2. AÇÃO: ABRIR POPUP DE ENVIO POR E-MAIL
  const handleOpenEmailModal = () => {
    if (!sendVoucherEmailEnabled) {
      toast.warning("O envio de Voucher por e-mail está desativado nas Configurações da Área do Assinante.");
      return;
    }
    setEmailStatusMsg(null);
    setShowEmailModal(true);
  };

  // 3. AÇÃO: EFETUAR DISPARO DE E-MAIL
  const handleSendEmailSubmit = async () => {
    if (!targetEmail || !targetEmail.includes("@")) {
      setEmailStatusMsg({
        type: "error",
        text: "Por favor, informe um e-mail de destino válido.",
      });
      return;
    }

    setLoadingSendEmail(true);
    setEmailStatusMsg(null);

    try {
      const pdfData = buildPdfData();
      const pdfBase64 = generateReservaPdfBase64(pdfData);

      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: targetEmail.trim(),
          recipientName: reservation.guestName,
          documentType: "voucher",
          subject: `Voucher de Reserva #${reservation.id} - ${hotelName}`,
          message: `Olá, ${reservation.guestName}! Segue em anexo a confirmação/voucher da sua reserva para o Quarto ${reservation.roomId || ""}.`,
          pdfBase64,
          filename: `Voucher_Reserva_Quarto_${reservation.roomId || "101"}.pdf`,
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

      const data = await response.json();

      if (response.ok && data.success) {
        setEmailStatusMsg({
          type: "success",
          text: data.message || `Voucher da Reserva #${reservation.id} enviado com sucesso para ${targetEmail}!`,
        });
        toast.success(`✓ Voucher da Reserva enviado com sucesso para ${targetEmail}!`);
        setTimeout(() => {
          setShowEmailModal(false);
          setEmailStatusMsg(null);
        }, 2500);
      } else {
        setEmailStatusMsg({
          type: "error",
          text: data.error || data.message || "Erro no servidor SMTP.",
        });
      }
    } catch (err: any) {
      console.error("Erro ao enviar voucher por e-mail:", err);
      setEmailStatusMsg({
        type: "error",
        text: err.message || "Erro de conexão ao enviar e-mail.",
      });
    } finally {
      setLoadingSendEmail(false);
    }
  };

  // 4. AÇÃO: ENVIAR VOUCHER POR WHATSAPP (UAZAPI / WHATSAPP WEB)
  const handleSendWhatsApp = async () => {
    if (!reservation.phone) {
      toast.warning("A reserva não possui um telefone/WhatsApp cadastrado.");
      return;
    }

    setLoadingSendWpp(true);
    try {
      const pdfData = buildPdfData();
      const pdfBase64 = generateReservaPdfBase64(pdfData);

      const captionMsg = `Olá, *${reservation.guestName}*!\nSegue em anexo a confirmação da sua reserva no *${hotelName || "Hotel"}*.\n\n📌 *Reserva:* ${reservation.id}\n🏨 *Quarto:* ${reservation.roomId}\n📅 *Período:* ${formatDateBr(reservation.checkInDate)} a ${formatDateBr(reservation.checkOutDate)}\n💰 *Valor Total:* R$ ${(reservation.totalAmount || 0).toFixed(2)}\n💵 *Adiantamento Pago:* R$ ${(reservation.depositPaid || 0).toFixed(2)}\n\nAgradecemos a preferência!`;

      const res = await fetch("/api/uazapi/send-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: reservation.phone,
          guestName: reservation.guestName,
          caption: captionMsg,
          pdfBase64: pdfBase64,
          filename: `Voucher_Reserva_${reservation.id}.pdf`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`✓ Voucher enviado com sucesso via WhatsApp para ${reservation.phone}!`);
      } else {
        console.warn("Uazapi não respondeu com sucesso. Abrindo link direto do WhatsApp Web...", data);
        const cleanPhone = reservation.phone.replace(/\D/g, "");
        const targetPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        const wppUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(captionMsg)}`;
        window.open(wppUrl, "_blank");
        toast.info("Abrindo WhatsApp Web com o comprovante da reserva.");
      }
    } catch (err) {
      console.error("Erro ao enviar via WhatsApp:", err);
      const cleanPhone = reservation.phone.replace(/\D/g, "");
      const targetPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const captionMsg = `Olá, *${reservation.guestName}*!\nSegue a confirmação da sua reserva no *${hotelName || "Hotel"}* (Reserva ${reservation.id}).`;
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(captionMsg)}`, "_blank");
    } finally {
      setLoadingSendWpp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* CARD CONTAINER (Adapta dinamicamente ao tema do SaaS) */}
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${theme.bgCard} ${theme.borderColor}`}>
        
        {/* HEADER BAR */}
        <div className={`p-4 border-b flex items-center justify-between ${theme.isDark ? "bg-[#1E293B] border-slate-800" : "bg-slate-100 border-slate-200"}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0284C7]/20 border border-[#0284C7]/40 flex items-center justify-center text-[#0284C7]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-bold ${theme.textMain}`}>Voucher da Reserva #{reservation.id}</h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    reservation.status === "CHECKED_IN"
                      ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                      : reservation.status === "CONFIRMED"
                      ? "bg-sky-500/20 text-sky-500 border border-sky-500/30"
                      : "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                  }`}
                >
                  {reservation.status === "CHECKED_IN" ? "Em Hospedagem" : reservation.status === "CONFIRMED" ? "Confirmada" : "Pré-Reserva"}
                </span>
              </div>
              <p className={`text-xs ${theme.textMuted}`}>Detalhamento completo do comprovante de acomodação</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition-colors ${
              theme.isDark
                ? "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700"
                : "bg-slate-200 border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-300"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY CONTENT */}
        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
          {/* HOTEL & RESERVATION SUMMARY BOX */}
          <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
            theme.isDark ? "bg-[#1E293B]/60 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div>
              <span className="text-[10px] text-[#0284C7] font-bold uppercase tracking-wider block">EMISSÃO DO VOUCHER</span>
              <h3 className={`text-sm font-bold mt-0.5 ${theme.textMain}`}>{hotelName || "HOTEL IDEAL"}</h3>
              <p className={`text-xs ${theme.textMuted}`}>{hotelAddress || "Alto Paraná - Redenção - PA"}</p>
            </div>
            <div className="text-right">
              <span className={`text-[10px] block ${theme.textMuted}`}>Número do Voucher</span>
              <span className="text-sm font-mono font-bold text-[#0284C7]">{reservation.id}</span>
            </div>
          </div>

          {/* DADOS DO HÓSPEDE E ACOMODAÇÃO GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* HÓSPEDE */}
            <div className={`p-4 rounded-xl border space-y-2 ${
              theme.isDark ? "bg-[#1E293B]/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider ${
                theme.isDark ? "text-slate-300" : "text-slate-700"
              }`}>
                <User className="w-3.5 h-3.5 text-[#0284C7]" />
                Dados do Hóspede
              </span>
              <div>
                <p className={`text-sm font-semibold ${theme.textMain}`}>{reservation.guestName}</p>
                <p className={`text-xs mt-0.5 ${theme.textMuted}`}>CPF: {reservation.cpf || "Não informado"}</p>
                <p className={`text-xs flex items-center gap-1 mt-1 ${theme.textMuted}`}>
                  <Phone className="w-3 h-3 text-[#0284C7]" />
                  {reservation.phone || "Não informado"}
                </p>
              </div>
            </div>

            {/* ACOMODAÇÃO */}
            <div className={`p-4 rounded-xl border space-y-2 ${
              theme.isDark ? "bg-[#1E293B]/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider ${
                theme.isDark ? "text-slate-300" : "text-slate-700"
              }`}>
                <Building2 className="w-3.5 h-3.5 text-[#0284C7]" />
                Acomodação Reservada
              </span>
              <div>
                <p className={`text-sm font-semibold ${theme.textMain}`}>Quarto {reservation.roomId}</p>
                <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                  Tarifa: <span className="font-semibold">{reservation.company || "Tarifa Padrão"}</span>
                </p>
                <p className={`text-xs mt-1 ${theme.textMuted}`}>
                  Valor da Diária: <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">R$ {(reservation.dailyRate || 0).toFixed(2)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* PERÍODO E VALORES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PERÍODO DA RESERVA */}
            <div className={`p-4 rounded-xl border space-y-2 ${
              theme.isDark ? "bg-[#1E293B]/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider ${
                theme.isDark ? "text-slate-300" : "text-slate-700"
              }`}>
                <Calendar className="w-3.5 h-3.5 text-[#0284C7]" />
                Período da Estadia ({totalNights} {totalNights === 1 ? "diária" : "diárias"})
              </span>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className={theme.textMuted}>Entrada (Check-in):</span>
                  <span className={`font-semibold font-mono ${theme.textMain}`}>{formatDateBr(reservation.checkInDate)} às {reservation.checkInTime || defaultCheckInTime || "14:00"}</span>
                </div>
                <div className="flex justify-between">
                  <span className={theme.textMuted}>Saída (Check-out):</span>
                  <span className={`font-semibold font-mono ${theme.textMain}`}>{formatDateBr(reservation.checkOutDate)} às {reservation.checkOutTime || defaultCheckOutTime || "12:00"}</span>
                </div>
              </div>
            </div>

            {/* RESUMO FINANCEIRO */}
            <div className={`p-4 rounded-xl border space-y-2 ${
              theme.isDark ? "bg-[#1E293B]/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <span className={`text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wider ${
                theme.isDark ? "text-slate-300" : "text-slate-700"
              }`}>
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                Resumo de Valores
              </span>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className={theme.textMuted}>Valor Total das Diárias:</span>
                  <span className={`font-semibold font-mono ${theme.textMain}`}>R$ {(reservation.totalAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={theme.textMuted}>Adiantamento Pago:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">R$ {(reservation.depositPaid || 0).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between pt-1 border-t ${theme.borderColor}`}>
                  <span className={`font-bold ${theme.textMain}`}>Saldo Restante no Check-in:</span>
                  <span className="font-bold text-amber-500 font-mono">R$ {balanceDue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* OBSERVAÇÕES */}
          {reservation.notes && (
            <div className={`p-3 rounded-xl border text-xs ${
              theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
            }`}>
              <span className={`font-bold block mb-1 ${theme.textMain}`}>Observações da Reserva:</span>
              <p className={`italic ${theme.textMuted}`}>{reservation.notes}</p>
            </div>
          )}
        </div>

        {/* MODAL FOOTER WITH ACTION BUTTONS */}
        <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 ${
          theme.isDark ? "bg-[#1E293B] border-slate-800" : "bg-slate-100 border-slate-200"
        }`}>
          {onEdit && (
            <button
              onClick={() => {
                onClose();
                onEdit(reservation);
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                theme.isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Editar Reserva
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {/* BOTÃO 1: IMPRIMIR VOUCHER */}
            <button
              onClick={handlePrintVoucher}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border shadow-sm transition-all ${
                theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white border-slate-700" : "bg-white hover:bg-slate-50 text-slate-800 border-slate-300"
              }`}
              title="Imprimir Voucher de Reserva"
            >
              <Printer className="w-4 h-4 text-sky-500" />
              Imprimir Voucher
            </button>

            {/* BOTÃO 2: ENVIAR POR E-MAIL */}
            <button
              onClick={handleOpenEmailModal}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-600/20 transition-all"
              title="Enviar Voucher por E-mail"
            >
              <Mail className="w-4 h-4 text-white" />
              Enviar por E-mail
            </button>

            {/* BOTÃO 3: ENVIAR POR WHATSAPP */}
            <button
              onClick={handleSendWhatsApp}
              disabled={loadingSendWpp}
              className="px-4 py-2 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#10B981]/20 transition-all disabled:opacity-50"
              title="Enviar Voucher por WhatsApp"
            >
              {loadingSendWpp ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4" />
              )}
              Enviar p/ WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* POPUP DEDICADO DE ENVIO POR E-MAIL */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-slate-900 border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-600" /> Enviar Voucher por E-mail (SMTP)
              </h4>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe o e-mail do destinatário para envio da confirmação/voucher da reserva do hóspede <strong>{reservation.guestName}</strong>.
              </p>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">E-mail do Destinatário:</label>
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="hospede@email.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-mono text-xs focus:outline-none focus:border-purple-500 font-bold"
                />
              </div>

              {/* PDF Attachment Badge */}
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="font-bold text-purple-950 block text-[11px]">
                      Documento PDF Anexado
                    </span>
                    <span className="text-[10px] text-purple-700 font-mono">
                      Voucher_Reserva_Quarto_{reservation.roomId || "101"}.pdf
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 text-white">
                  PDF Gerado
                </span>
              </div>

              {/* Status feedback message */}
              {emailStatusMsg && (
                <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                  emailStatusMsg.type === "success"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {emailStatusMsg.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{emailStatusMsg.text}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowEmailModal(false)}
                disabled={loadingSendEmail}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmailSubmit}
                disabled={loadingSendEmail}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-purple-600/20"
              >
                {loadingSendEmail ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando E-mail...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar E-mail</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualizarReservaModal;
