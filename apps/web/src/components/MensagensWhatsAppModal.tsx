"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Send, Paperclip, MessageCircle, FileText, ShoppingBag, Receipt, Trash2, Eye, EyeOff, UserRound } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { generateExtratoPdfBase64, generateResumoPdfBase64, generateConsumoPdfBase64 } from "@/utils/pdfGenerator";
import type { ExtratoRoomData } from "@/components/ImprimirExtratoHospedagemModal";

export interface WhatsAppMessageRoomData extends ExtratoRoomData {
  stayId: string;
}

interface SentMessage {
  id: string;
  type: string;
  direction: "IN" | "OUT";
  content: string | null;
  filename: string | null;
  senderName: string | null;
  createdAt: string;
}

interface MensagensWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomData: WhatsAppMessageRoomData;
  tenantId?: string;
}

export const MensagensWhatsAppModal: React.FC<MensagensWhatsAppModalProps> = ({
  isOpen,
  onClose,
  roomData,
  tenantId,
}) => {
  const { theme, hotelName, uazapiServerUrl, uazapiInstanceToken } = useTheme();

  const [phoneVisible, setPhoneVisible] = useState(true);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [hasWhatsapp, setHasWhatsapp] = useState<boolean | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [messageText, setMessageText] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [sendingDocType, setSendingDocType] = useState<"resumo" | "consumo" | "extrato" | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const phone = roomData.phone || "";

  useEffect(() => {
    if (!isOpen || !phone) return;

    setLoadingProfile(true);
    fetch("/api/uazapi/profile-picture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, tenantId }),
    })
      .then((r) => r.json())
      .then((data) => {
        setHasWhatsapp(!!data.hasWhatsapp);
        setProfileImage(data.image || null);
      })
      .catch(() => setHasWhatsapp(false))
      .finally(() => setLoadingProfile(false));
  }, [isOpen, phone, tenantId]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = (showLoading = false) => {
    if (!roomData.stayId) return;
    if (showLoading) setLoadingMessages(true);
    fetch(`/api/uazapi/messages?stayId=${roomData.stayId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMessages(data.messages || []);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  };

  const markMessagesRead = () => {
    if (!roomData.stayId) return;
    fetch("/api/uazapi/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stayId: roomData.stayId }),
    }).catch(() => {});
  };

  // Ao abrir a conversa: carrega o histórico e marca as mensagens recebidas como lidas (some o
  // indicador de "não lidas" do quarto no Mapa de Quartos). Enquanto a tela ficar aberta, faz
  // polling curto para exibir em tempo quase real as respostas que chegarem do hóspede.
  useEffect(() => {
    if (!isOpen) return;
    loadMessages(true);
    markMessagesRead();
    const interval = setInterval(() => {
      loadMessages(false);
      markMessagesRead();
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, roomData.stayId]);

  // Mantém a última mensagem sempre visível — rola a conversa para o fim toda vez que a lista muda
  // (nova mensagem enviada, recebida via polling, ou histórico inicial carregado).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const logSentMessage = async (type: string, content: string | null, filename: string | null) => {
    try {
      await fetch("/api/uazapi/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, stayId: roomData.stayId, phone, type, content, filename }),
      });
      loadMessages();
    } catch {
      // log local é best-effort — não deve bloquear o fluxo de envio
    }
  };

  const canSend = phone && phone.trim().length >= 8;

  const buildTotals = () => {
    const tariffList = roomData.tariffList || [];
    const consumptionList = roomData.consumptionList || [];
    const totalDiarias = tariffList.reduce((acc, t) => acc + (t.dailyRate || 0), 0);
    const totalConsumo = consumptionList.reduce((acc, c) => acc + (c.totalPrice || 0), 0);
    const outrosDebitos = roomData.outrosDebitos ?? 0;
    const adiantamento = roomData.adiantamento ?? 0;
    const desconto = roomData.desconto ?? 0;
    const totalDespesas = totalDiarias + totalConsumo + outrosDebitos;
    const saldoAPagar = totalDespesas - adiantamento - desconto;
    return { tariffList, consumptionList, totalDiarias, totalConsumo, outrosDebitos, adiantamento, desconto, totalDespesas, saldoAPagar };
  };

  const sendDocument = async (pdfBase64: string, filename: string, caption: string, logType: string) => {
    const res = await fetch("/api/uazapi/send-extrato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        caption,
        pdfBase64,
        filename,
        guestName: roomData.guestName,
        roomNumber: roomData.number,
        tenantId,
        serverUrl: uazapiServerUrl,
        instanceToken: uazapiInstanceToken,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || "Falha ao enviar documento via WhatsApp.");
    }
    await logSentMessage(logType, caption, filename);
  };

  const handleSendResumo = async () => {
    if (!canSend) return;
    setSendingDocType("resumo");
    setStatusMsg(null);
    try {
      const t = buildTotals();
      const pdfBase64 = generateResumoPdfBase64({
        hotelName: hotelName || "HOTEL IDEAL",
        roomNumber: roomData.number || "",
        guestName: roomData.guestName || "",
        cpf: roomData.cpf,
        checkInDate: roomData.checkInDate || "",
        prevCheckOutDate: roomData.prevCheckOutDate || "",
        calculatedUntil: t.tariffList[t.tariffList.length - 1]?.endDate || roomData.actualCheckOutDate || "",
        diariasCount: t.tariffList.length || 1,
        totalDiarias: t.totalDiarias,
        totalConsumo: t.totalConsumo,
        outrosDebitos: t.outrosDebitos,
        totalDespesas: t.totalDespesas,
        pagamentosAmount: t.adiantamento,
        descontos: t.desconto,
        saldoAPagar: Math.max(0, t.saldoAPagar),
        consumptionItems: t.consumptionList.map((c) => ({
          dateTime: c.date,
          description: c.description,
          unitPrice: c.unitPrice,
          quantity: c.quantity,
          totalPrice: c.totalPrice,
        })),
      });
      const filename = `Resumo_Hospedagem_Quarto_${roomData.number || ""}.pdf`;
      const caption = `Segue anexo o resumo da hospedagem do hóspede: ${roomData.guestName || ""} quarto: ${roomData.number || ""}`;
      await sendDocument(pdfBase64, filename, caption, "document");
      setStatusMsg({ type: "success", text: "Resumo da hospedagem enviado com sucesso!" });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Erro ao enviar resumo da hospedagem." });
    } finally {
      setSendingDocType(null);
    }
  };

  const handleSendConsumo = async () => {
    if (!canSend) return;
    setSendingDocType("consumo");
    setStatusMsg(null);
    try {
      const consumptionList = roomData.consumptionList || [];
      const pdfBase64 = generateConsumoPdfBase64({
        hotelName: hotelName || "HOTEL IDEAL",
        guestName: roomData.guestName || "",
        roomNumber: roomData.number,
        items: consumptionList.map((c) => ({
          dateTime: c.date,
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          totalPrice: c.totalPrice,
        })),
      });
      const filename = `Consumo_Quarto_${roomData.number || ""}.pdf`;
      const caption = `Segue anexo o comprovante de consumo do hóspede: ${roomData.guestName || ""} quarto: ${roomData.number || ""}`;
      await sendDocument(pdfBase64, filename, caption, "document");
      setStatusMsg({ type: "success", text: "Comprovante de consumo enviado com sucesso!" });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Erro ao enviar comprovante de consumo." });
    } finally {
      setSendingDocType(null);
    }
  };

  const handleSendExtrato = async () => {
    if (!canSend) return;
    setSendingDocType("extrato");
    setStatusMsg(null);
    try {
      const t = buildTotals();
      const adianMaisDesconto = t.desconto + t.adiantamento;
      const pdfBase64 = generateExtratoPdfBase64({
        hotelName: hotelName || "HOTEL IDEAL",
        roomNumber: roomData.number || "",
        guestName: roomData.guestName || "",
        cpf: roomData.cpf,
        address: roomData.address,
        cityUf: roomData.city && roomData.uf ? `${roomData.city}/${roomData.uf}` : undefined,
        checkInDate: roomData.checkInDate || "",
        checkOutDate: roomData.actualCheckOutDate || roomData.prevCheckOutDate || "",
        startDateFiltered: roomData.checkInDate?.split(" ")[0] || "",
        endDateFiltered: (roomData.actualCheckOutDate || roomData.prevCheckOutDate || "").split(" ")[0] || "",
        tariffs: t.tariffList.map((tf) => ({
          description: tf.description,
          startDate: tf.startDate,
          endDate: tf.endDate,
          dailyRate: tf.dailyRate,
        })),
        consumptions: t.consumptionList.map((c) => ({
          dateTime: c.date,
          description: c.description,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          totalPrice: c.totalPrice,
        })),
        totals: {
          totalDiarias: t.totalDiarias,
          totalConsumo: t.totalConsumo,
          outrosDebitos: t.outrosDebitos,
          adiantamento: t.adiantamento,
          desconto: t.desconto,
          totalDespesas: t.totalDespesas,
          adianMaisDesconto,
          saldoAPagar: t.saldoAPagar,
        },
      });
      const filename = `Extrato_Hospedagem_Quarto_${roomData.number || ""}.pdf`;
      const caption = `Segue anexo o extrato da hospedagem do hóspede: ${roomData.guestName || ""} quarto: ${roomData.number || ""}`;
      await sendDocument(pdfBase64, filename, caption, "document");
      setStatusMsg({ type: "success", text: "Extrato de hospedagem enviado com sucesso!" });
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Erro ao enviar extrato de hospedagem." });
    } finally {
      setSendingDocType(null);
    }
  };

  const handleSendText = async () => {
    if (!canSend || !messageText.trim()) return;
    setSendingText(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/send-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          message: messageText,
          tenantId,
          serverUrl: uazapiServerUrl,
          instanceToken: uazapiInstanceToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Falha ao enviar mensagem.");
      }
      await logSentMessage("text", messageText, null);
      setMessageText("");
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Erro ao enviar mensagem." });
    } finally {
      setSendingText(false);
    }
  };

  const handleClearLocalHistory = async () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  const maskedPhone = phone ? phone.replace(/(\d{2})(\d+)(\d{4})/, "$1********$3") : "";

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[88vh] max-h-[88vh] border ${theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200"}`}>
        {/* HEADER */}
        <div className={`px-4 py-3 flex items-center justify-between border-b ${theme.isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-sm tracking-wide">Mensagens WhatsApp</h3>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${theme.isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-200 text-slate-500 hover:text-slate-900"}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TOP INFO PANEL */}
        <div className={`p-4 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
          {/* Foto + telefone */}
          <div className="flex flex-col items-center gap-2 sm:w-40">
            <div className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center border-2 ${hasWhatsapp ? "border-emerald-500" : "border-slate-500"} ${theme.isDark ? "bg-slate-800" : "bg-slate-200"}`}>
              {loadingProfile ? (
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : profileImage ? (
                <img src={profileImage} alt={roomData.guestName} className="w-full h-full object-cover" />
              ) : (
                <UserRound className={`w-9 h-9 ${theme.isDark ? "text-slate-500" : "text-slate-400"}`} />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-semibold">{phoneVisible ? phone || "-" : maskedPhone || "-"}</span>
              <button onClick={() => setPhoneVisible((v) => !v)} className={theme.isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}>
                {phoneVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${hasWhatsapp ? "bg-emerald-500/15 text-emerald-500" : "bg-slate-500/15 text-slate-500"}`}>
              {loadingProfile ? "Verificando..." : hasWhatsapp ? "WhatsApp ativo" : "WhatsApp indisponível"}
            </span>
          </div>

          {/* Dados da hospedagem + ações */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className={`block font-semibold ${theme.textMuted}`}>Quarto</span>
                <span className="font-bold">{roomData.number || "-"}</span>
              </div>
              <div>
                <span className={`block font-semibold ${theme.textMuted}`}>Dt.Chegada</span>
                <span>{roomData.checkInDate || "-"}</span>
              </div>
              <div>
                <span className={`block font-semibold ${theme.textMuted}`}>Dt.Saída</span>
                <span>{roomData.actualCheckOutDate || roomData.prevCheckOutDate || "-"}</span>
              </div>
            </div>
            <div className={`text-sm font-bold px-3 py-1.5 rounded-lg ${theme.isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-900"}`}>
              {roomData.guestName || "-"}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSendResumo}
                disabled={!canSend || sendingDocType !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> {sendingDocType === "resumo" ? "Enviando..." : "Enviar resumo hospedagem"}
              </button>
              <button
                onClick={handleSendConsumo}
                disabled={!canSend || sendingDocType !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" /> {sendingDocType === "consumo" ? "Enviando..." : "Enviar apenas consumo"}
              </button>
              <button
                onClick={handleSendExtrato}
                disabled={!canSend || sendingDocType !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
              >
                <Receipt className="w-3.5 h-3.5" /> {sendingDocType === "extrato" ? "Enviando..." : "Enviar extrato hospedagem"}
              </button>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold ${statusMsg.type === "success" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
            {statusMsg.text}
          </div>
        )}

        {!canSend && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-500">
            Este hóspede não possui um telefone WhatsApp cadastrado — cadastre um telefone para enviar mensagens.
          </div>
        )}

        {/* CONVERSA (mensagens enviadas pelo hotel + respostas recebidas do hóspede via webhook) */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${theme.textMuted}`}>
              Conversa
            </span>
            {messages.length > 0 && (
              <button onClick={handleClearLocalHistory} className="text-[11px] text-red-500 hover:text-red-400 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Limpar da tela
              </button>
            )}
          </div>

          {loadingMessages ? (
            <div className={`text-xs italic ${theme.textMuted}`}>Carregando...</div>
          ) : messages.length === 0 ? (
            <div className={`text-xs italic ${theme.textMuted}`}>Nenhuma mensagem nesta hospedagem ainda.</div>
          ) : (
            messages.map((m) => {
              const isIn = m.direction === "IN";
              return (
                <div key={m.id} className={`flex ${isIn ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg text-xs ${
                      isIn
                        ? theme.isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-900"
                        : "bg-emerald-600 text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <span className="font-semibold flex items-center gap-1">
                        {m.type === "document" || m.type === "media" ? <Paperclip className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                        {isIn ? m.senderName || roomData.guestName || "Hóspede" : m.filename || (m.type === "document" ? "Documento" : "Você")}
                      </span>
                      <span className={`text-[10px] ${isIn ? theme.textMuted : "text-emerald-100"}`}>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    {m.content && <p>{m.content}</p>}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* COMPOR MENSAGEM */}
        <div className={`p-3 border-t space-y-2 ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
          <label className={`text-xs font-semibold block ${theme.textMuted}`}>Mensagem:</label>
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Digite uma mensagem para o hóspede..."
              disabled={!canSend}
              className={`flex-1 border rounded-xl p-2.5 text-xs resize-none focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
            />
            <button
              onClick={handleSendText}
              disabled={!canSend || sendingText || !messageText.trim()}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* FOOTER */}
        <div className={`px-4 py-3 border-t flex justify-end ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold ${theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}
          >
            Fechar conversa
          </button>
        </div>
      </div>
    </div>
  );
};
