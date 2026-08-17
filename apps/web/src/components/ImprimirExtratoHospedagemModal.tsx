"use client";

import React, { useState, useMemo, useEffect } from "react";
import { X, Printer, MessageSquare, Filter, Eye, Check, RefreshCw, FileText, Mail } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { generateExtratoPdfBase64 } from "@/utils/pdfGenerator";

export interface GuestItem {
  id: string;
  name: string;
  isPrimary?: boolean;
}

export interface ConsumptionItem {
  itemNumber: number;
  description: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  operatorName?: string | null;
  posLocationName?: string | null;
}

export interface TariffPeriodItem {
  description: string;
  startDate: string; // YYYY-MM-DD or DD/MM/YYYY
  endDate: string;
  dailyRate: number;
}

export interface ExtratoRoomData {
  number: string;
  category?: string;
  guestName: string;
  cpf?: string;
  cep?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  uf?: string;
  phone?: string;
  checkInDate: string; // e.g. "23/01/2026 21:18:49"
  prevCheckOutDate: string; // e.g. "24/01/2026 14:00:00"
  actualCheckOutDate?: string; // e.g. "11/08/2026 16:39:04"
  extrasAmount?: number; // quantidade de diárias extras (além da saída originalmente prevista), não valor monetário
  outrosDebitos?: number;
  adiantamento?: number;
  desconto?: number;
  allGuests?: GuestItem[];
  consumptionList?: ConsumptionItem[];
  tariffList?: TariffPeriodItem[];
}

interface ImprimirExtratoHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomData: ExtratoRoomData;
}

// Sample fallback mock tariff generator if roomData has none
function generateMockTariffs(checkInStr: string, checkOutStr: string, baseRate: number): TariffPeriodItem[] {
  const result: TariffPeriodItem[] = [];
  try {
    // Basic date parsing assumption: DD/MM/YYYY
    const [dStr] = checkInStr.split(" ");
    const [d, m, y] = dStr.split("/").map(Number);
    const start = new Date(y, m - 1, d);

    // Create daily tariff rows
    for (let i = 0; i < 20; i++) {
      const curStart = new Date(start);
      curStart.setDate(start.getDate() + i);
      const curEnd = new Date(curStart);
      curEnd.setDate(curStart.getDate() + 1);

      const formatDt = (dt: Date) =>
        `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;

      result.push({
        description: "REPRESENTANTE",
        startDate: formatDt(curStart),
        endDate: formatDt(curEnd),
        dailyRate: baseRate > 0 ? baseRate : 140,
      });
    }
  } catch (e) {
    // fallback
    result.push({
      description: "REPRESENTANTE",
      startDate: "23/01/2026",
      endDate: "24/01/2026",
      dailyRate: 140,
    });
  }
  return result;
}

const formatDateMask = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const ImprimirExtratoHospedagemModal: React.FC<ImprimirExtratoHospedagemModalProps> = ({
  isOpen,
  onClose,
  roomData: liveRoomData,
}) => {
  const {
    hotelName,
    hotelLogo,
    showLogoInPrint,
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

  // Padrão desta tela: os dados são buscados do banco UMA VEZ, na abertura da janela, e ficam
  // estáticos enquanto ela permanece aberta — não devem ser sobrescritos pela sincronização em
  // segundo plano (a cada 3s) que o Mapa de Quartos roda por trás. Por isso guardamos aqui um
  // snapshot local (roomData) em vez de usar a prop ao vivo (liveRoomData) diretamente no corpo do componente.
  const [roomData, setRoomData] = useState<ExtratoRoomData>(liveRoomData);

  // Extract initial date strings (DD/MM/YYYY)
  const initialStartDate = roomData.checkInDate ? roomData.checkInDate.split(" ")[0] : "23/01/2026";
  const initialEndDate = roomData.actualCheckOutDate
    ? roomData.actualCheckOutDate.split(" ")[0]
    : "11/08/2026";

  const [dtInicialInput, setDtInicialInput] = useState<string>(formatDateMask(initialStartDate));
  const [dtFinalInput, setDtFinalInput] = useState<string>(formatDateMask(initialEndDate));
  
  // Applied filter state
  const [appliedStartDate, setAppliedStartDate] = useState<string>(formatDateMask(initialStartDate));
  const [appliedEndDate, setAppliedEndDate] = useState<string>(formatDateMask(initialEndDate));

  // Só tira um novo snapshot (e reinicializa os campos de data) quando o modal é ABERTO
  // (transição false -> true), nunca em atualizações subsequentes de liveRoomData (ex: polling
  // de sincronização do Mapa de Quartos a cada 3s) — senão tanto os dados exibidos quanto o valor
  // digitado pelo usuário nos filtros de data seriam sobrescritos enquanto o modal está aberto.
  const wasOpenRef = React.useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setRoomData(liveRoomData);
      const start = liveRoomData.checkInDate ? liveRoomData.checkInDate.split(" ")[0] : "23/01/2026";
      const end = liveRoomData.actualCheckOutDate
        ? liveRoomData.actualCheckOutDate.split(" ")[0]
        : "11/08/2026";
      const formattedStart = formatDateMask(start);
      const formattedEnd = formatDateMask(end);
      setDtInicialInput(formattedStart);
      setDtFinalInput(formattedEnd);
      setAppliedStartDate(formattedStart);
      setAppliedEndDate(formattedEnd);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, liveRoomData]);

  const [modeSynthetic, setModeSynthetic] = useState<boolean>(false); // false = Analítico, true = Sintético
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);
  const [showWppModal, setShowWppModal] = useState<boolean>(false);
  const [wppPhone, setWppPhone] = useState<string>(roomData.phone || "63992428861");
  const [sendingWpp, setSendingWpp] = useState<boolean>(false);
  const [wppStatusMsg, setWppStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Estados do Modal de E-mail
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // O hóspede principal já é exibido no cabeçalho ("Nome do Hospede Principal") — esta lista
  // é só dos acompanhantes da hospedagem, para não duplicar o nome principal na grade abaixo.
  const guests: GuestItem[] = useMemo(() => {
    return (roomData.allGuests || []).filter((g) => !g.isPrimary);
  }, [roomData]);

  const rawConsumptions: ConsumptionItem[] = useMemo(() => {
    if (roomData.consumptionList && roomData.consumptionList.length > 0) return roomData.consumptionList;
    return [
      { itemNumber: 1, description: "REFRIG LATA", date: "31/01/2026 12:31", quantity: 1, unitPrice: 6.0, totalPrice: 6.0 },
      { itemNumber: 2, description: "LAV PEÇA GRANDE", date: "31/01/2026 12:31", quantity: 8, unitPrice: 7.0, totalPrice: 56.0 },
    ];
  }, [roomData]);

  const rawTariffs: TariffPeriodItem[] = useMemo(() => {
    if (roomData.tariffList && roomData.tariffList.length > 0) return roomData.tariffList;
    return generateMockTariffs(roomData.checkInDate || "23/01/2026", roomData.actualCheckOutDate || "11/08/2026", 140);
  }, [roomData]);

  // Helper date parse: DD/MM/YYYY to Date object
  const parseDDMMYYYY = (str: string): Date | null => {
    if (!str) return null;
    const parts = str.trim().split(" ")[0].split("/");
    if (parts.length < 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  };

  // Filter tariffs and recalculate based on applied filter dates
  const filteredTariffs = useMemo(() => {
    const startDt = parseDDMMYYYY(appliedStartDate);
    const endDt = parseDDMMYYYY(appliedEndDate);

    if (!startDt || !endDt) return rawTariffs;

    return rawTariffs.filter((t) => {
      const itemStart = parseDDMMYYYY(t.startDate);
      if (!itemStart) return true;
      return itemStart >= startDt && itemStart <= endDt;
    });
  }, [rawTariffs, appliedStartDate, appliedEndDate]);

  // Filter consumption items based on applied filter dates
  const filteredConsumptions = useMemo(() => {
    const startDt = parseDDMMYYYY(appliedStartDate);
    const endDt = parseDDMMYYYY(appliedEndDate);

    if (!startDt || !endDt) return rawConsumptions;

    return rawConsumptions.filter((c) => {
      const itemDt = parseDDMMYYYY(c.date);
      if (!itemDt) return true;
      return itemDt >= startDt && itemDt <= endDt;
    });
  }, [rawConsumptions, appliedStartDate, appliedEndDate]);

  // Financial Calculations according to user formulas:
  // - total consumo: total de consumo dos produtos e serviços do quarto
  // - total diarias: total bruto das diarias
  // - outros debitos: debitos vindo de outros quartos por transferencia de debito
  // - adiantamento: total de adiantamentos no quarto
  // - desconto: total de desconto
  // - total de despesas = total de consumo + total diarias + outros debitos
  // - adian+desconto = desconto total + total adiantamentos
  // - saldo a pagar = total despesas - adian+desconto

  const totalDiarias = useMemo(() => {
    return filteredTariffs.reduce((acc, t) => acc + (t.dailyRate || 0), 0);
  }, [filteredTariffs]);

  const totalConsumo = useMemo(() => {
    return filteredConsumptions.reduce((acc, c) => acc + (c.totalPrice || 0), 0);
  }, [filteredConsumptions]);

  const outrosDebitos = roomData.outrosDebitos ?? 0;
  const adiantamento = roomData.adiantamento ?? 0;
  const desconto = roomData.desconto ?? 0;

  const totalDespesas = totalConsumo + totalDiarias + outrosDebitos;
  const adianMaisDesconto = desconto + adiantamento;
  const saldoAPagar = totalDespesas - adianMaisDesconto;

  const handleFilterClick = () => {
    setAppliedStartDate(dtInicialInput);
    setAppliedEndDate(dtFinalInput);
  };

  const handlePrintClick = () => {
    setShowPrintPreview(true);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleSendWhatsApp = async () => {
    if (!wppPhone || wppPhone.trim().length < 8) {
      setWppStatusMsg({ type: "error", text: "Informe um número de WhatsApp válido." });
      return;
    }

    setSendingWpp(true);
    setWppStatusMsg(null);

    try {
      // 1. Generate PDF in Base64
      const pdfBase64 = generateExtratoPdfBase64({
        hotelName: hotelName || "HOTEL IDEAL",
        roomNumber: roomData.number || "102",
        guestName: roomData.guestName || "Marcos Oliveira",
        cpf: roomData.cpf,
        address: roomData.address,
        cityUf: roomData.city && roomData.uf ? `${roomData.city}/${roomData.uf}` : undefined,
        checkInDate: roomData.checkInDate || "23/01/2026 21:18:49",
        checkOutDate: roomData.actualCheckOutDate || roomData.prevCheckOutDate || "11/08/2026",
        startDateFiltered: appliedStartDate,
        endDateFiltered: appliedEndDate,
        tariffs: filteredTariffs.map((t) => ({
          description: t.description,
          startDate: t.startDate,
          endDate: t.endDate,
          dailyRate: t.dailyRate,
        })),
        consumptions: filteredConsumptions.map((c) => ({
          dateTime: c.date,
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          totalPrice: c.totalPrice,
        })),
        totals: {
          totalDiarias,
          totalConsumo,
          outrosDebitos,
          adiantamento,
          desconto,
          totalDespesas,
          adianMaisDesconto,
          saldoAPagar,
        },
      });

      const caption = `Segue anexo o extrato da hospedagem do hospede: ${roomData.guestName || ""} quarto: ${roomData.number || ""}`;
      const docFilename = `Extrato_Hospedagem_Quarto_${roomData.number || "102"}.pdf`;

      // 2. Call backend proxy endpoint to transmit PDF via Uazapi API
      const res = await fetch("/api/uazapi/send-extrato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: wppPhone,
          caption,
          pdfBase64,
          filename: docFilename,
          fileName: docFilename,
          guestName: roomData.guestName,
          roomNumber: roomData.number,
          serverUrl: uazapiServerUrl,
          instanceToken: uazapiInstanceToken,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }

      if (data.success) {
        setWppStatusMsg({
          type: "success",
          text: data.message || "Extrato em PDF enviado com sucesso via WhatsApp (Uazapi)!",
        });

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
      console.error("Erro ao enviar extrato via WhatsApp:", err);
      setWppStatusMsg({
        type: "error",
        text: `Falha no envio: ${err.message || "Verifique as configurações do Uazapi."}`,
      });
    } finally {
      setSendingWpp(false);
    }
  };

  const handleSendEmailExtrato = async () => {
    if (!sendReceiptEmailEnabled) {
      setEmailStatusMsg({
        type: "error",
        text: "O envio de Recibos/Extratos por e-mail está desativado nas Configurações da Área do Assinante.",
      });
      return;
    }

    if (!emailAddress || !emailAddress.includes("@")) {
      setEmailStatusMsg({
        type: "error",
        text: "Por favor, insira um endereço de e-mail válido.",
      });
      return;
    }

    setSendingEmail(true);
    setEmailStatusMsg(null);

    try {
      const pdfBase64 = generateExtratoPdfBase64({
        hotelName: hotelName || "HOTEL IDEAL",
        roomNumber: roomData.number || "102",
        guestName: roomData.guestName || "FAUSTO DE OLIVEIRA DA COSTA",
        cpf: roomData.cpf,
        address: roomData.address,
        cityUf: roomData.city && roomData.uf ? `${roomData.city}/${roomData.uf}` : undefined,
        checkInDate: roomData.checkInDate || "23/01/2026 21:18:49",
        checkOutDate: roomData.actualCheckOutDate || roomData.prevCheckOutDate || "11/08/2026",
        startDateFiltered: appliedStartDate,
        endDateFiltered: appliedEndDate,
        tariffs: filteredTariffs.map((t) => ({
          description: t.description,
          startDate: t.startDate,
          endDate: t.endDate,
          dailyRate: t.dailyRate,
        })),
        consumptions: filteredConsumptions.map((c) => ({
          dateTime: c.date,
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          totalPrice: c.totalPrice,
        })),
        totals: {
          totalDiarias,
          totalConsumo,
          outrosDebitos,
          adiantamento,
          desconto,
          totalDespesas,
          adianMaisDesconto,
          saldoAPagar,
        },
      });

      const docFilename = `Extrato_Hospedagem_Quarto_${roomData.number || "102"}.pdf`;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail: emailAddress.trim(),
          recipientName: roomData.guestName,
          documentType: "receipt",
          subject: `Extrato de Hospedagem - Quarto ${roomData.number || "102"} - ${hotelName}`,
          message: `Olá, ${roomData.guestName}! Segue em anexo o resumo do extrato e consumo da sua hospedagem no Quarto ${roomData.number || ""}.`,
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
        setEmailStatusMsg({
          type: "success",
          text: data.message || "Extrato enviado com sucesso por e-mail!",
        });
        setTimeout(() => {
          setShowEmailModal(false);
          setEmailStatusMsg(null);
        }, 3000);
      } else {
        setEmailStatusMsg({
          type: "error",
          text: data.error || data.message || "Erro no envio do e-mail. Verifique o servidor SMTP.",
        });
      }
    } catch (err: any) {
      console.error("Erro ao enviar extrato por e-mail:", err);
      setEmailStatusMsg({
        type: "error",
        text: err.message || "Erro de rede ao enviar e-mail.",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-transparent print:static print:block">
      {/* Printable CSS container when window.print() is triggered */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-white text-black z-[100] p-6 overflow-y-auto print-container print:block hidden font-mono text-xs">
          {/* Header */}
          <div className="text-center pb-1">
            <h1 className="text-xl font-bold uppercase tracking-tight">{hotelName || "HOTEL IDEAL"} - 40.904.811/0001-31</h1>
            <p className="text-[11px] text-slate-700">RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614</p>
            <div className="h-1.5 bg-black w-full mt-2 mb-3"></div>
          </div>

          {/* Stay & Guest Header Info matching extrato da hospedagem.pdf */}
          <div className="space-y-1 text-xs mb-3">
            <div className="flex flex-wrap gap-x-6">
              <span><strong>Dt.Cheg:</strong> {roomData.checkInDate || "23/01/2026 21:18:49"}</span>
              <span><strong>Dt.Prev.Sai:</strong> {roomData.prevCheckOutDate || "24/01/2026 14:00:00"}</span>
              <span><strong>Diarias:</strong> {filteredTariffs.length}</span>
              <span><strong>Calculado ate:</strong> {appliedEndDate}</span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>Quarto:</strong> {roomData.number || "310"}</span>
              <span><strong>CPF:</strong> {roomData.cpf || "865.172.281-87"}</span>
              <span><strong>Hosp.Principal:</strong> {roomData.guestName || "FAUSTO DE OLIVEIRA DA COSTA"}</span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>CEP:</strong> {roomData.cep || "74660040"}</span>
              <span><strong>Logradouro:</strong> {roomData.address || "CORIOLANDO A LOYOLA"}</span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>Bairro:</strong> {roomData.neighborhood || "ST CRIMEIA LESTE"}</span>
              <span><strong>Cidade:</strong> {roomData.city || "GOIANIA"}</span>
              <span><strong>U.F.:</strong> {roomData.uf || "GO"}</span>
              <span><strong>Passaporte:</strong></span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>CNPJ:</strong></span>
              <span><strong>Empresa:</strong></span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>I.E.:</strong></span>
              <span><strong>Logradouro:</strong></span>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <span><strong>Bairro:</strong></span>
              <span><strong>Cidade:</strong></span>
              <span><strong>U.F.:</strong></span>
            </div>
          </div>

          {/* Period Header */}
          <div className="my-2 font-bold text-xs">
            Periodo: {appliedStartDate} {appliedEndDate}
          </div>

          {/* Tariffs Table */}
          <div className="mb-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-black text-left font-bold">
                  <th className="pb-1">Descrição da Tarifa</th>
                  <th className="pb-1 text-center">Data inicio</th>
                  <th className="pb-1 text-center">Data Final</th>
                  <th className="pb-1 text-right">Valor Tarifa(R$)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTariffs.map((t, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="py-1">{t.description}</td>
                    <td className="py-1 text-center">{t.startDate}</td>
                    <td className="py-1 text-center">{t.endDate}</td>
                    <td className="py-1 text-right">R$ {t.dailyRate.toFixed(2).replace(".", ",")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right font-bold text-xs mt-2 pr-2">
              Total de diarias: R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* Consumptions Table */}
          {filteredConsumptions.length > 0 && (
            <div className="mb-4 avoid-break">
              <table className="w-full text-[9px] border-collapse">
                <thead>
                  <tr className="border-b border-black text-left font-bold">
                    <th className="pb-1">Dt/Hora Consumo</th>
                    <th className="pb-1">Descrição produto/serviço</th>
                    <th className="pb-1 text-center">Quant.</th>
                    <th className="pb-1 text-right">Valor Unit.(R$)</th>
                    <th className="pb-1 text-right">Valor Total(R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsumptions.map((c, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      <td className="py-0.5">{c.date}</td>
                      <td className="py-0.5">
                        {c.description}
                        {c.posLocationName ? `(${c.posLocationName})` : ""}
                      </td>
                      <td className="py-0.5 text-center">{c.quantity.toFixed(4).replace(".", ",")}</td>
                      <td className="py-0.5 text-right">R$ {c.unitPrice.toFixed(2).replace(".", ",")}</td>
                      <td className="py-0.5 text-right">R$ {c.totalPrice.toFixed(2).replace(".", ",")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Financial Summary matching exact layout of extrato da hospedagem.pdf */}
          <div className="space-y-1 text-xs max-w-sm mt-4 font-mono avoid-break">
            <div className="flex justify-between">
              <span>Total consumo(R$) :</span>
              <span className="font-semibold">R$ {totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Total diarias(R$) :</span>
              <span className="font-semibold">R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Outros debitos(R$).:</span>
              <span className="font-semibold">R$ {outrosDebitos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Adiantamento(R$)..:</span>
              <span className="font-semibold">R$ {adiantamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Desconto(R$)....:</span>
              <span className="font-semibold">R$ {desconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="pt-2 space-y-1 font-bold">
              <div className="flex justify-between">
                <span>Total despesas (R$):</span>
                <span>R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span>Adian+Desconto R$).:</span>
                <span>R$ {adianMaisDesconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Saldo pagar (R$)...:</span>
                <span>R$ {saldoAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Signature matching PDF */}
          <div className="pt-12 pb-2 text-center avoid-break">
            <div className="h-1 bg-black w-full max-w-xl mx-auto mb-1"></div>
            <div className="font-mono font-bold text-xs italic">
              Assinatura do hospede
            </div>
          </div>
        </div>
      )}

      {/* WINDEV EXTRATO DE HOSPEDAGEM WINDOW FRAME */}
      <div className="bg-[#EAEAEA] text-slate-900 border-2 border-slate-400 rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden font-sans text-xs flex flex-col max-h-[92vh] print:hidden">
        
        {/* Title Bar WinDev */}
        <div className="bg-gradient-to-r from-slate-200 via-slate-300 to-slate-200 border-b border-slate-400 px-3 py-1.5 flex items-center justify-between shadow-sm select-none">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-sm bg-sky-600 flex items-center justify-center text-[9px] text-white font-bold">
              H
            </div>
            <span className="font-semibold text-slate-800 text-xs tracking-tight">
              Imprimir resumo de hospedagem - Situaçao da thread: Thread_ChecarQuartos - em execução
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded bg-slate-300 hover:bg-red-500 hover:text-white border border-slate-400 flex items-center justify-center text-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1 bg-[#F4F4F4]">
          
          {/* HEADER STRIP: Quartos, Nome Hóspede, Dates, Extras */}
          <div className="bg-[#E4E4E4] border border-slate-300 p-2 rounded space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-bold text-slate-700">Quartos:</span>
                <select className="bg-white border border-slate-400 rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none">
                  <option>{roomData.number || "310"}</option>
                </select>
              </div>

              <div className="flex items-center gap-1 flex-1 min-w-[240px]">
                <span className="font-bold text-slate-700 whitespace-nowrap">Nome do Hospede Principal:</span>
                <div className="bg-[#FFFFC0] border border-slate-400 px-2 py-0.5 font-bold text-slate-900 flex-1 min-w-0 truncate rounded-sm">
                  {roomData.guestName || "FAUSTO DE OLIVEIRA DA COSTA"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
              <div>
                <span className="font-bold text-slate-700">Dt.Chegada:</span>{" "}
                <span className="text-slate-900">{roomData.checkInDate || "23/01/2026 21:18:49"}</span>
              </div>

              <div>
                <span className="font-bold text-slate-700">Dt.Prevista Saida:</span>{" "}
                <span className="text-slate-900">{roomData.prevCheckOutDate || "24/01/2026 14:00:00"}</span>
              </div>

              <div>
                <span className="font-bold text-slate-700">Diarias:</span>{" "}
                <span className="text-slate-900">{filteredTariffs.length || 1}</span>
              </div>

              <div>
                <span className="font-bold text-slate-700">Dt. Saida:</span>{" "}
                <span className="text-slate-900">{roomData.actualCheckOutDate || "11/08/2026 16:39:04"}</span>
              </div>

              <div>
                <span className="font-bold text-slate-700">Extras:</span>{" "}
                <span className="text-red-600 font-bold">{roomData.extrasAmount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* UPPER GRID (2 COLUMNS): Left: Guest List | Right: Financial Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            
            {/* Left Box: Nome Hospede Table */}
            <div className="md:col-span-5 bg-white border border-slate-300 rounded overflow-hidden flex flex-col h-40">
              <div className="bg-[#00BCD4] text-white font-bold px-2 py-1 flex items-center justify-between text-xs">
                <span>Acompanhantes</span>
                <span className="text-[10px]">Filter</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b text-slate-600 text-[11px]">
                      <th className="px-2 py-1 border-r w-8 text-center">#</th>
                      <th className="px-2 py-1">Nome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {guests.map((g, idx) => (
                      <tr key={g.id} className="hover:bg-sky-50">
                        <td className="px-2 py-1 border-r text-center font-mono text-[10px] text-slate-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-semibold text-slate-800">{g.name}</td>
                      </tr>
                    ))}
                    {guests.length === 0 && (
                      <tr>
                        <td colSpan={2} className="text-center py-4 text-slate-400 italic">Nenhum acompanhante registrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Box: Pagamentos (Totals Grid) */}
            <div className="md:col-span-7 bg-white border border-slate-300 rounded p-2 flex flex-col justify-between h-44">
              <div className="border-b border-slate-300 pb-1 font-bold text-slate-700 text-xs flex justify-between">
                <span>Pagamentos:</span>
                <span className="text-[10px] text-slate-500 font-mono">Total Despesas: R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 py-1 text-xs font-mono">
                {/* Total Diárias */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Total Diarias (R$)</span>
                  <div className="bg-[#FFFFC0] border border-slate-300 px-1.5 py-0.5 font-bold text-amber-800 text-right text-xs rounded-sm">
                    R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Total Consumo */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Total Consumo(R$)</span>
                  <div className="bg-[#FFFFC0] border border-slate-300 px-1.5 py-0.5 font-bold text-amber-800 text-right text-xs rounded-sm">
                    R$ {totalConsumo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Outros Débitos */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Outros Débitos(R$)</span>
                  <div className="bg-[#FFFFC0] border border-slate-300 px-1.5 py-0.5 font-bold text-slate-800 text-right text-xs rounded-sm">
                    R$ {outrosDebitos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Total Adiantamento */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Adiantamento (R$)</span>
                  <div className="bg-[#E0F2FE] border border-slate-300 px-1.5 py-0.5 font-bold text-sky-800 text-right text-xs rounded-sm">
                    R$ {adiantamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Desconto */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Desconto (R$)</span>
                  <div className="bg-[#E0F2FE] border border-slate-300 px-1.5 py-0.5 font-bold text-sky-800 text-right text-xs rounded-sm">
                    R$ {desconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Adian + Desconto */}
                <div>
                  <span className="block text-[10px] text-slate-600 font-semibold truncate">Adian+Desconto</span>
                  <div className="bg-[#E0F2FE] border border-slate-300 px-1.5 py-0.5 font-bold text-sky-900 text-right text-xs rounded-sm">
                    R$ {adianMaisDesconto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Saldo a pagar Prominent Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="font-extrabold text-blue-900 text-xs tracking-tight">Saldo a pagar (R$)</span>
                <span className="font-black text-red-600 text-lg font-mono tracking-tight">
                  R$ {saldoAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

          </div>

          {/* MIDDLE GRID: Relação de consumo */}
          <div className="bg-white border border-slate-300 rounded overflow-hidden flex flex-col max-h-36">
            <div className="bg-[#00BCD4] text-white font-bold px-2 py-1 flex items-center justify-between text-xs">
              <span>Relação de consumo</span>
              <span className="text-[10px]">Filtrar por data</span>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b text-slate-600 text-[11px] font-semibold">
                    <th className="px-2 py-1 border-r w-12 text-center">Item</th>
                    <th className="px-2 py-1 border-r w-28">Dt/Hora Lançto.</th>
                    <th className="px-2 py-1 border-r">Descrição</th>
                    <th className="px-2 py-1 border-r w-24">Operador</th>
                    <th className="px-2 py-1 border-r w-24">PDV</th>
                    <th className="px-2 py-1 border-r text-right w-20">Quant.</th>
                    <th className="px-2 py-1 border-r text-right w-24">Valor.Unit</th>
                    <th className="px-2 py-1 text-right w-24">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredConsumptions.map((c) => (
                    <tr key={c.itemNumber} className="hover:bg-slate-50">
                      <td className="px-2 py-1 border-r text-center font-mono text-slate-500">{c.itemNumber}</td>
                      <td className="px-2 py-1 border-r font-mono text-slate-700">{c.date}</td>
                      <td className="px-2 py-1 border-r font-semibold text-slate-800">{c.description}</td>
                      <td className="px-2 py-1 border-r text-slate-700">{c.operatorName || "-"}</td>
                      <td className="px-2 py-1 border-r text-slate-700">{c.posLocationName || "-"}</td>
                      <td className="px-2 py-1 border-r text-right font-mono">{c.quantity.toFixed(4)}</td>
                      <td className="px-2 py-1 border-r text-right font-mono">R$ {c.unitPrice.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right font-mono font-bold text-slate-900">R$ {c.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredConsumptions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-4 text-slate-400 italic">Nenhum consumo no período filtrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* LOWER SECTION: Período da tarifa (Filter Controls & Tariff Grid) */}
          <div className="bg-white border border-slate-300 rounded p-2 space-y-2">
            
            {/* Filter Bar & Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              
              {/* Left: Date Inputs & Filter Trigger */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-700">Período da tarifa:</span>
                
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-600 font-semibold">Dt.Inicial</span>
                  <input
                    type="text"
                    value={dtInicialInput}
                    onChange={(e) => setDtInicialInput(formatDateMask(e.target.value))}
                    maxLength={10}
                    placeholder="DD/MM/YYYY"
                    className="bg-[#FFFFC0] border border-slate-400 rounded px-1.5 py-0.5 text-xs font-mono font-bold w-24 text-center focus:outline-none focus:border-sky-600 shadow-inner"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-600 font-semibold">Dt.Final</span>
                  <input
                    type="text"
                    value={dtFinalInput}
                    onChange={(e) => setDtFinalInput(formatDateMask(e.target.value))}
                    maxLength={10}
                    placeholder="DD/MM/YYYY"
                    className="bg-[#FFFFC0] border border-slate-400 rounded px-1.5 py-0.5 text-xs font-mono font-bold w-24 text-center focus:outline-none focus:border-sky-600 shadow-inner"
                  />
                </div>

                <button
                  onClick={handleFilterClick}
                  className="bg-[#00BCD4] hover:bg-[#00ACC1] text-white font-bold px-3 py-1 rounded shadow-sm flex items-center gap-1 transition-colors"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar
                </button>

                {/* Radio Options: Sintético / Analítico */}
                <div className="flex items-center gap-3 ml-2 text-xs font-semibold text-slate-700">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tariffMode"
                      checked={modeSynthetic}
                      onChange={() => setModeSynthetic(true)}
                      className="accent-cyan-600"
                    />
                    Sintético
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="tariffMode"
                      checked={!modeSynthetic}
                      onChange={() => setModeSynthetic(false)}
                      className="accent-cyan-600"
                    />
                    Analítico
                  </label>
                </div>
              </div>

              {/* Right: Main Cyan Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintClick}
                  className="bg-[#00BCD4] hover:bg-[#00ACC1] text-white font-extrabold px-4 py-2 rounded-md shadow-md flex items-center gap-2 transition-all transform hover:scale-[1.01]"
                >
                  <span>Imprimir extrato de hospedagem</span>
                  <Printer className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowWppModal(true)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded-md shadow-sm flex items-center gap-1.5 transition-colors border border-slate-400"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>Enviar extrato Whats app</span>
                </button>

                <button
                  onClick={() => setShowEmailModal(true)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded-md shadow-sm flex items-center gap-1.5 transition-colors border border-slate-400"
                >
                  <Mail className="w-4 h-4 text-purple-600" />
                  <span>Enviar extrato E-mail</span>
                </button>
              </div>

            </div>

            {/* Tariff Grid Table */}
            <div className="overflow-y-auto max-h-40 border border-slate-300 rounded">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#00BCD4] text-white font-bold">
                  <tr>
                    <th className="px-3 py-1.5">Descrição Tarifa</th>
                    <th className="px-3 py-1.5 text-center">Data Inicial</th>
                    <th className="px-3 py-1.5 text-center">Data Final</th>
                    <th className="px-3 py-1.5 text-right">Valor Tarifa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredTariffs.map((t, idx) => (
                    <tr key={idx} className="hover:bg-sky-50">
                      <td className="px-3 py-1 font-semibold text-slate-800">{t.description}</td>
                      <td className="px-3 py-1 text-center font-mono">{t.startDate}</td>
                      <td className="px-3 py-1 text-center font-mono">{t.endDate}</td>
                      <td className="px-3 py-1 text-right font-mono font-semibold">R$ {t.dailyRate.toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredTariffs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-slate-400 italic">
                        Nenhuma diária encontrada no período de {appliedStartDate} a {appliedEndDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-100 border-t border-slate-300 font-bold">
                  <tr>
                    <td colSpan={3} className="px-3 py-1.5 text-slate-700 uppercase">Total ({filteredTariffs.length} diárias no período)</td>
                    <td className="px-3 py-1.5 text-right font-mono text-emerald-800 text-sm">
                      R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

          </div>

        </div>

        {/* Footer Bar */}
        <div className="bg-slate-200 border-t border-slate-300 px-3 py-2 flex items-center justify-between text-[11px] text-slate-600">
          <div>
            Período Aplicado: <span className="font-mono font-bold text-slate-800">{appliedStartDate}</span> a <span className="font-mono font-bold text-slate-800">{appliedEndDate}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-slate-400 hover:bg-slate-500 text-white font-bold transition-colors"
          >
            Fechar Janela
          </button>
        </div>

      </div>

      {/* WHATSAPP MODAL POPUP */}
      {showWppModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4 space-y-3 text-slate-900 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-emerald-600" /> Enviar Extrato via WhatsApp (Uazapi API)
              </h4>
              <button onClick={() => setShowWppModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe o WhatsApp do hóspede <strong>{roomData.guestName}</strong> para envio do resumo do extrato (Período: {appliedStartDate} a {appliedEndDate}).
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

              {/* PDF Attachment Badge */}
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-bold text-emerald-950 block text-[11px]">
                      Documento PDF Anexado
                    </span>
                    <span className="text-[10px] text-emerald-700 font-mono">
                      extrato_hospedagem_quarto_{roomData.number || "102"}.pdf
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">
                  PDF Gerado
                </span>
              </div>

              {/* Uazapi Subscriber Server Info */}
              <div className="p-2 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-600">
                <strong>Servidor Uazapi:</strong> {uazapiServerUrl} | <strong>Instância:</strong> {uazapiInstanceToken ? "••••" + uazapiInstanceToken.slice(-4) : "Padrão"}
              </div>

              {/* Status feedback message */}
              {wppStatusMsg && (
                <div className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                  wppStatusMsg.type === "success"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {wppStatusMsg.type === "success" ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <X className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{wppStatusMsg.text}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowWppModal(false)}
                disabled={sendingWpp}
                className="px-3.5 py-2 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendWhatsApp}
                disabled={sendingWpp}
                className="px-4 py-2 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {sendingWpp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando PDF via Uazapi...</span>
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Enviar no WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL MODAL POPUP */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4 space-y-3 text-slate-900 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-purple-600" /> Enviar Extrato por E-mail (SMTP)
              </h4>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Informe o e-mail do hóspede <strong>{roomData.guestName}</strong> para envio do extrato em PDF (Período: {appliedStartDate} a {appliedEndDate}).
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

              {/* PDF Attachment Badge */}
              <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  <div>
                    <span className="font-bold text-purple-950 block text-[11px]">
                      Documento PDF Anexado
                    </span>
                    <span className="text-[10px] text-purple-700 font-mono">
                      extrato_hospedagem_quarto_{roomData.number || "102"}.pdf
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
                disabled={sendingEmail}
                className="px-3.5 py-2 rounded text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendEmailExtrato}
                disabled={sendingEmail}
                className="px-4 py-2 rounded text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-md shadow-purple-600/20"
              >
                {sendingEmail ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando E-mail...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
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
