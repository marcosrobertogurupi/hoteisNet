"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Printer, MessageSquare, Mail, FileText, Check, RefreshCw, Receipt } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { ImprimirResumoHospedagemModal, ResumoRoomData } from "@/components/ImprimirResumoHospedagemModal";
import { generateResumoPdfBase64, generateConsumoPdfBase64 } from "@/utils/pdfGenerator";

function formatBrDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface StayDetailResponse {
  id: string;
  roomNumber: string;
  checkInDate: string;
  expectedCheckOut: string;
  actualCheckOut: string | null;
  totalDaily: number;
  totalConsumption: number;
  discount: number;
  otherDebits: number;
  dailyCharges: { referenceDate: string; amount: number; description: string }[];
  guest: {
    fullName: string;
    cpf: string | null;
    phone: string | null;
    whatsappPhone: string | null;
    city: string | null;
    state: string | null;
    street: string | null;
    neighborhood: string | null;
    zipCode: string | null;
    company: {
      cnpj: string;
      name: string;
      ie: string | null;
      address: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
    } | null;
  };
  consumptions: {
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    createdAt: string;
  }[];
}

interface PaymentRow {
  id: string;
  date: string;
  amount: number;
  methodDescription: string;
}

// Impressão silenciosa de um PDF (data URI) via iframe oculto — mesmo padrão já usado em
// LancarPagamentoHospedagemModal.tsx para "Imprimir Consumo".
function printPdfDataUri(pdfBase64: string) {
  const base64Data = pdfBase64.split(",")[1];
  const byteChars = atob(base64Data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
    URL.revokeObjectURL(url);
  };
  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };
  setTimeout(cleanup, 60000);
}

interface ConsultaCheckoutAcoesModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayId: string;
}

export const ConsultaCheckoutAcoesModal: React.FC<ConsultaCheckoutAcoesModalProps> = ({
  isOpen,
  onClose,
  stayId,
}) => {
  const {
    hotelName,
    uazapiServerUrl,
    uazapiInstanceToken,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpSecure,
    emailSmtpUser,
    emailSmtpPass,
    emailFromName,
    emailFromAddress,
    emailFooterText,
    sendReceiptEmailEnabled,
  } = useTheme();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [stay, setStay] = useState<StayDetailResponse | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  // Descrições (uppercase) das formas de pagamento cadastradas como Parcelamento (ex.: FATURA) —
  // usado para separar, no Resumo de Hospedagem, o que foi pago de fato do que foi faturado para a
  // empresa conveniada, exatamente como no Mapa de Quartos (apps/web/src/app/app/page.tsx).
  const [installmentPaymentMethodNames, setInstallmentPaymentMethodNames] = useState<Set<string>>(new Set());
  const [showResumoModal, setShowResumoModal] = useState(false);

  const [showWppModal, setShowWppModal] = useState(false);
  const [wppPhone, setWppPhone] = useState("");
  const [sendingWpp, setSendingWpp] = useState(false);
  const [wppStatusMsg, setWppStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !stayId) return;
    setStay(null);
    setPayments([]);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/stay/checkin?stayId=${stayId}`);
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Não foi possível carregar a hospedagem.", "Erro");
          onClose();
          return;
        }
        setStay(data.stay);
        setWppPhone(data.stay.guest.whatsappPhone || data.stay.guest.phone || "");

        try {
          const contaRes = await fetch(`/api/caixa/conta-quarto?stayCheckinId=${stayId}`);
          const contaData = await contaRes.json();
          if (contaData.success) setPayments(contaData.payments || []);
        } catch {
          // segue sem histórico de pagamentos se o caixa não responder
        }

        try {
          const formasRes = await fetch("/api/cadastros/formas-pagamento");
          const formasData = await formasRes.json();
          if (formasData?.success && Array.isArray(formasData.paymentMethods)) {
            setInstallmentPaymentMethodNames(
              new Set(
                formasData.paymentMethods
                  .filter((f: any) => f.installment)
                  .map((f: any) => String(f.description).toUpperCase())
              )
            );
          }
        } catch {
          // sem a lista de formas de pagamento, tudo é tratado como recebido (nenhuma como faturamento)
        }
      } catch (err: any) {
        toast.error(err.message || "Erro de rede ao carregar a hospedagem.", "Erro");
        onClose();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stayId]);

  const billing = useMemo(() => {
    if (!stay) return null;

    const totalDiarias = stay.totalDaily;
    const totalConsumo = stay.totalConsumption;
    const outrosDebitos = stay.otherDebits ?? 0;
    const descontos = stay.discount ?? 0;
    const totalDespesas = totalDiarias + totalConsumo + outrosDebitos;

    // Separa o que foi efetivamente pago do que foi faturado para a empresa conveniada (forma de
    // pagamento com Parcelamento, ex.: FATURA) — mesma regra do Resumo de Hospedagem impresso no
    // Mapa de Quartos: nunca somar os dois como se tudo fosse pagamento recebido.
    const totalAdiantamento = payments.reduce((acc, p) => acc + p.amount, 0);
    const totalFaturado = payments
      .filter((p) => installmentPaymentMethodNames.has(p.methodDescription.toUpperCase()))
      .reduce((acc, p) => acc + p.amount, 0);
    const pagamentosAmount = totalAdiantamento - totalFaturado;
    const saldoAPagar = totalDespesas - totalAdiantamento - descontos;

    // Nesta tela a hospedagem já está encerrada — "Calculado até" deve ser a data/hora real do
    // check-out (stay.actualCheckOut), não a data teórica de fim da última diária lançada.
    const calculatedUntil = formatBrDateTime(stay.actualCheckOut);

    const consumptionItems = stay.consumptions.map((c) => ({
      dateTime: formatBrDateTime(c.createdAt),
      description: c.productName,
      unitPrice: c.unitPrice,
      quantity: c.quantity,
      totalPrice: c.totalPrice,
    }));

    return {
      totalDiarias,
      totalConsumo,
      outrosDebitos,
      descontos,
      totalDespesas,
      pagamentosAmount,
      totalAFaturar: totalFaturado,
      saldoAPagar,
      calculatedUntil,
      diariasCount: Math.max(1, stay.dailyCharges.length),
      consumptionItems,
    };
  }, [stay, payments, installmentPaymentMethodNames]);

  const resumoRoomData: ResumoRoomData | null = useMemo(() => {
    if (!stay || !billing) return null;
    return {
      number: stay.roomNumber,
      guestName: stay.guest.fullName,
      cpf: stay.guest.cpf || "",
      cep: stay.guest.zipCode || "",
      address: stay.guest.street || "",
      neighborhood: stay.guest.neighborhood || "",
      city: stay.guest.city || "",
      uf: stay.guest.state || "",
      phone: stay.guest.whatsappPhone || stay.guest.phone || "",
      checkInDate: formatBrDateTime(stay.checkInDate),
      prevCheckOutDate: formatBrDateTime(stay.expectedCheckOut),
      companyData: stay.guest.company
        ? {
            cnpj: stay.guest.company.cnpj,
            companyName: stay.guest.company.name,
            ie: stay.guest.company.ie || "",
            address: stay.guest.company.address || "",
            neighborhood: stay.guest.company.neighborhood || "",
            city: stay.guest.company.city || "",
            uf: stay.guest.company.state || "",
          }
        : undefined,
      calculatedUntil: billing.calculatedUntil,
      diariasCount: billing.diariasCount,
      totalDiarias: billing.totalDiarias,
      totalConsumo: billing.totalConsumo,
      outrosDebitos: billing.outrosDebitos,
      totalDespesas: billing.totalDespesas,
      pagamentosAmount: billing.pagamentosAmount,
      totalAFaturar: billing.totalAFaturar,
      descontos: billing.descontos,
      saldoAPagar: billing.saldoAPagar,
      consumptionItems: billing.consumptionItems,
      paymentItems: payments.map((p) => ({
        dateTime: p.date,
        amount: p.amount,
        paymentMethod: p.methodDescription,
      })),
    };
  }, [stay, billing, payments]);

  const buildResumoPdfBase64 = () => {
    if (!stay || !billing) return "";
    return generateResumoPdfBase64({
      hotelName: hotelName || "HOTEL IDEAL",
      roomNumber: stay.roomNumber,
      guestName: stay.guest.fullName,
      cpf: stay.guest.cpf || "",
      checkInDate: formatBrDateTime(stay.checkInDate),
      prevCheckOutDate: formatBrDateTime(stay.expectedCheckOut),
      companyData: stay.guest.company
        ? {
            cnpj: stay.guest.company.cnpj,
            companyName: stay.guest.company.name,
            ie: stay.guest.company.ie || "",
            address: stay.guest.company.address || "",
            neighborhood: stay.guest.company.neighborhood || "",
            city: stay.guest.company.city || "",
            uf: stay.guest.company.state || "",
          }
        : undefined,
      calculatedUntil: billing.calculatedUntil,
      diariasCount: billing.diariasCount,
      totalDiarias: billing.totalDiarias,
      totalConsumo: billing.totalConsumo,
      outrosDebitos: billing.outrosDebitos,
      totalDespesas: billing.totalDespesas,
      pagamentosAmount: billing.pagamentosAmount,
      totalAFaturar: billing.totalAFaturar,
      descontos: billing.descontos,
      saldoAPagar: billing.saldoAPagar,
      consumptionItems: billing.consumptionItems,
    });
  };

  const handlePrintConsumo = () => {
    if (!stay) return;
    if (stay.consumptions.length === 0) {
      toast.warning("Nenhum consumo lançado nesta hospedagem.", "Consumo Vazio");
      return;
    }
    const pdfBase64 = generateConsumoPdfBase64({
      hotelName: hotelName || "HOTEL IDEAL",
      guestName: stay.guest.fullName,
      roomNumber: stay.roomNumber,
      items: stay.consumptions.map((c) => ({
        dateTime: formatBrDateTime(c.createdAt),
        description: c.productName,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        totalPrice: c.totalPrice,
      })),
    });
    printPdfDataUri(pdfBase64);
  };

  const handleSendWhatsApp = async () => {
    if (!stay) return;
    if (!wppPhone || wppPhone.trim().length < 8) {
      setWppStatusMsg({ type: "error", text: "Informe um número de WhatsApp válido." });
      return;
    }
    setSendingWpp(true);
    setWppStatusMsg(null);
    try {
      const pdfBase64 = buildResumoPdfBase64();
      const caption = `Segue anexo o resumo da hospedagem do hóspede: ${stay.guest.fullName} quarto: ${stay.roomNumber}`;
      const docFilename = `Resumo_Hospedagem_Quarto_${stay.roomNumber}.pdf`;

      const res = await fetch("/api/uazapi/send-extrato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: wppPhone,
          caption,
          pdfBase64,
          filename: docFilename,
          fileName: docFilename,
          guestName: stay.guest.fullName,
          roomNumber: stay.roomNumber,
          serverUrl: uazapiServerUrl,
          instanceToken: uazapiInstanceToken,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (data.success) {
        setWppStatusMsg({ type: "success", text: data.message || "Resumo enviado com sucesso via WhatsApp!" });
        setTimeout(() => {
          setShowWppModal(false);
          setWppStatusMsg(null);
        }, 3000);
      } else {
        setWppStatusMsg({
          type: "error",
          text: data.message || "Erro no envio pelo Uazapi. Verifique se a instância está conectada.",
        });
      }
    } catch (err: any) {
      setWppStatusMsg({ type: "error", text: `Falha no envio: ${err.message || "Verifique as configurações do Uazapi."}` });
    } finally {
      setSendingWpp(false);
    }
  };

  const handleSendEmail = async () => {
    if (!stay) return;
    if (!sendReceiptEmailEnabled) {
      setEmailStatusMsg({
        type: "error",
        text: "O envio de Recibos/Extratos por e-mail está desativado nas Configurações da Área do Assinante.",
      });
      return;
    }
    if (!emailAddress || !emailAddress.includes("@")) {
      setEmailStatusMsg({ type: "error", text: "Por favor, insira um endereço de e-mail válido." });
      return;
    }
    setSendingEmail(true);
    setEmailStatusMsg(null);
    try {
      const pdfBase64 = buildResumoPdfBase64();
      const docFilename = `Resumo_Hospedagem_Quarto_${stay.roomNumber}.pdf`;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: emailAddress.trim(),
          recipientName: stay.guest.fullName,
          documentType: "receipt",
          subject: `Resumo da Hospedagem - Quarto ${stay.roomNumber} - ${hotelName}`,
          message: `Olá, ${stay.guest.fullName}! Segue em anexo o resumo da sua hospedagem no Quarto ${stay.roomNumber}.`,
          pdfBase64,
          filename: docFilename,
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
        setEmailStatusMsg({ type: "success", text: data.message || "Resumo enviado com sucesso por e-mail!" });
        setTimeout(() => {
          setShowEmailModal(false);
          setEmailStatusMsg(null);
        }, 3000);
      } else {
        setEmailStatusMsg({ type: "error", text: data.error || data.message || "Erro no envio do e-mail. Verifique o servidor SMTP." });
      }
    } catch (err: any) {
      setEmailStatusMsg({ type: "error", text: err.message || "Erro de rede ao enviar e-mail." });
    } finally {
      setSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    {/* Este painel nunca deve aparecer na impressão — só o ImprimirResumoHospedagemModal abaixo
        (que tem seu próprio layout print:static) deve ficar visível ao imprimir, senão os dois
        se sobrepõem no PDF/impressão. */}
    <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:hidden">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-300">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-sm tracking-wide">
              Hospedagem encerrada {stay ? `— Quarto ${stay.roomNumber}` : ""}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !stay || !billing ? (
          <div className="p-10 text-center text-slate-500 text-sm">Carregando dados da hospedagem...</div>
        ) : (
          <>
            {/* Dados completos */}
            <div className="p-4 overflow-y-auto space-y-3 font-mono text-xs">
              <div className="border border-slate-300 rounded-lg p-3 space-y-1.5 bg-slate-50">
                <div className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1 mb-1">
                  Dados do hóspede
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div><span className="text-slate-500">Hóspede:</span> <span className="font-semibold">{stay.guest.fullName}</span></div>
                  <div><span className="text-slate-500">CPF:</span> {stay.guest.cpf || "-"}</div>
                  <div><span className="text-slate-500">Telefone:</span> {stay.guest.whatsappPhone || stay.guest.phone || "-"}</div>
                  <div><span className="text-slate-500">Dt.Chegada:</span> {formatBrDateTime(stay.checkInDate)}</div>
                  <div><span className="text-slate-500">Dt.Prev.Saída:</span> {formatBrDateTime(stay.expectedCheckOut)}</div>
                  <div><span className="text-slate-500">Dt.Check-out:</span> <span className="font-semibold">{formatBrDateTime(stay.actualCheckOut)}</span></div>
                </div>
              </div>

              <div className="border border-slate-300 rounded-lg p-3 space-y-1.5 bg-slate-50">
                <div className="font-bold text-slate-900 text-xs border-b border-slate-200 pb-1 mb-1">
                  Totais da hospedagem
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div><span className="text-slate-500">Total diárias:</span> R$ {billing.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  <div><span className="text-slate-500">Total consumo:</span> R$ {billing.totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  <div><span className="text-slate-500">Outros débitos:</span> R$ {billing.outrosDebitos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  <div><span className="text-slate-500">Pagamentos:</span> R$ {billing.pagamentosAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  <div><span className="text-slate-500">Descontos:</span> R$ {billing.descontos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  {billing.totalAFaturar > 0 && (
                    <div><span className="text-slate-500">Total a Faturar:</span> R$ {billing.totalAFaturar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                  )}
                  <div className="font-bold"><span className="text-slate-500 font-normal">Saldo a pagar:</span> R$ {billing.saldoAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                </div>
              </div>

              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 font-bold text-slate-700 text-xs border-b border-slate-300">
                  Consumo ({stay.consumptions.length} itens)
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {stay.consumptions.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 italic">Nenhum consumo registrado.</div>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {stay.consumptions.map((c, idx) => (
                          <tr key={idx} className="border-b border-slate-100">
                            <td className="px-2 py-1 text-slate-600">{formatBrDateTime(c.createdAt)}</td>
                            <td className="px-2 py-1">{c.productName}</td>
                            <td className="px-2 py-1 text-right">{c.quantity}</td>
                            <td className="px-2 py-1 text-right font-semibold">R$ {c.totalPrice.toFixed(2).replace(".", ",")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="bg-slate-100 border-t border-slate-300 p-3 flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setShowResumoModal(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir Resumo
              </button>
              <button
                onClick={handlePrintConsumo}
                className="px-3.5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 border border-slate-400"
              >
                <FileText className="w-3.5 h-3.5" /> Imprimir Consumo
              </button>
              <button
                onClick={() => setShowWppModal(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 border border-slate-400"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Enviar WhatsApp
              </button>
              <button
                onClick={() => setShowEmailModal(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 border border-slate-400"
              >
                <Mail className="w-3.5 h-3.5 text-purple-600" /> Enviar E-mail
              </button>
            </div>
          </>
        )}
      </div>
    </div>

    {resumoRoomData && (
      <ImprimirResumoHospedagemModal isOpen={showResumoModal} onClose={() => setShowResumoModal(false)} roomData={resumoRoomData} />
    )}

    {/* WHATSAPP MODAL */}
    {showWppModal && stay && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4 space-y-3 text-slate-900 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-600" /> Enviar Resumo via WhatsApp
              </h4>
              <button onClick={() => setShowWppModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe o WhatsApp do hóspede <strong>{stay.guest.fullName}</strong> para envio do resumo da hospedagem.
              </p>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Número do Telefone / Celular:</label>
                <input
                  type="text"
                  value={wppPhone}
                  onChange={(e) => setWppPhone(e.target.value)}
                  placeholder="63992428861"
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-2 font-mono text-xs focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>
              {wppStatusMsg && (
                <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                  wppStatusMsg.type === "success" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {wppStatusMsg.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{wppStatusMsg.text}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button onClick={() => setShowWppModal(false)} disabled={sendingWpp} className="px-3.5 py-2 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSendWhatsApp} disabled={sendingWpp} className="px-4 py-2 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50">
                {sendingWpp ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Enviando...</span></>) : (<><MessageSquare className="w-3.5 h-3.5" /><span>Enviar no WhatsApp</span></>)}
              </button>
            </div>
          </div>
        </div>
      )}

    {/* EMAIL MODAL */}
    {showEmailModal && stay && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4 space-y-3 text-slate-900 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-purple-600" /> Enviar Resumo por E-mail
              </h4>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe o e-mail do hóspede <strong>{stay.guest.fullName}</strong> para envio do resumo da hospedagem.
              </p>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Endereço de E-mail:</label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="hospede@email.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-2 font-mono text-xs focus:outline-none focus:border-purple-500 font-bold"
                />
              </div>
              {emailStatusMsg && (
                <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                  emailStatusMsg.type === "success" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {emailStatusMsg.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{emailStatusMsg.text}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button onClick={() => setShowEmailModal(false)} disabled={sendingEmail} className="px-3.5 py-2 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSendEmail} disabled={sendingEmail} className="px-4 py-2 rounded text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50">
                {sendingEmail ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Enviando...</span></>) : (<><Mail className="w-3.5 h-3.5" /><span>Enviar E-mail</span></>)}
              </button>
            </div>
          </div>
        </div>
    )}
    </>
  );
};
