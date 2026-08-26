"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { LifeBuoy, Sparkles, Send, CheckCircle2, Plus, ThumbsUp, ThumbsDown } from "lucide-react";

export default function TenantSupportPage() {
  const { theme } = useTheme();

  // Superfícies internas (bolhas da IA, campos de texto, botões secundários) seguem o tema
  // escolhido em Configurações — claro ou escuro.
  const innerSurface = theme.isDark
    ? "bg-[#1E293B] border-slate-800 text-slate-200"
    : "bg-slate-100 border-slate-200 text-slate-700";
  const inputClass = theme.isDark
    ? "bg-[#1E293B] border-slate-700 text-white"
    : "bg-white border-slate-300 text-slate-900";
  const secondaryBtn = theme.isDark
    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
    : "bg-slate-100 text-slate-700 hover:bg-slate-200";

  const [tickets, setTickets] = useState([
    {
      id: "TKT-1082",
      subject: "Dúvida na transmissão da FNRH para o SNRHos",
      category: "FNRH / Governo",
      status: "AI_RESOLVED",
      aiConfidence: 94,
      createdAt: "Há 10 minutos",
      lastMessage: "A IA de Suporte respondeu com o procedimento de re-transmissão automática.",
      resolvedByAi: true,
    },
    {
      id: "TKT-1045",
      subject: "Como configurar nova chave de integração da API do WhatsApp?",
      category: "WhatsApp",
      status: "CLOSED",
      aiConfidence: 98,
      createdAt: "Ontem às 14:30",
      lastMessage: "Procedimento validado e ticket finalizado.",
      resolvedByAi: true,
    },
  ]);

  const [activeTicket, setActiveTicket] = useState<any>(tickets[0]);
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketCategory, setNewTicketCategory] = useState("FNRH / Governo");
  const [newTicketMessage, setNewTicketMessage] = useState("");
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      sender: "USER",
      senderName: "Recepcionista Carlos",
      content: "Boa tarde! Tentei transmitir a FNRH do hóspede Marcos para o SNRHos e apareceu status pendente.",
      time: "10:12",
    },
    {
      sender: "AI_AGENT",
      senderName: "IA de Suporte Hoteis.Net (RAG Bot)",
      content: "Olá Carlos! Analisei nosso histórico de soluções e identificamos que o sistema SNRHos do Governo passa por janelas de manutenção às 10h. O Hoteis.Net SaaS re-enviará automaticamente a ficha em 15 minutos sem necessidade de re-digitação.",
      time: "10:12",
      confidence: 94,
    },
  ]);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg = {
      sender: "USER",
      senderName: "Recepcionista Carlos",
      content: chatInput,
      time: "Agora",
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    // Simulate AI response based on RAG knowledge base
    setTimeout(() => {
      const aiReply = {
        sender: "AI_AGENT",
        senderName: "IA de Suporte Hoteis.Net (RAG Bot)",
        content: "Entendido! Caso precise de auxílio imediato para faturamento corporativo ou QR Code do WhatsApp, também posso te guiar passo a passo.",
        time: "Agora",
        confidence: 92,
      };
      setMessages((prev) => [...prev, aiReply]);
    }, 800);
  };

  const handleCreateTicket = () => {
    if (!newTicketSubject.trim()) return;
    const newTkt = {
      id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
      subject: newTicketSubject,
      category: newTicketCategory,
      status: "AI_RESOLVED",
      aiConfidence: 89,
      createdAt: "Agora",
      lastMessage: newTicketMessage || "Novo chamado aberto.",
      resolvedByAi: true,
    };

    setTickets([newTkt, ...tickets]);
    setActiveTicket(newTkt);
    setShowNewTicketModal(false);
    setNewTicketSubject("");
    setNewTicketMessage("");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={`p-6 rounded-2xl border shadow-lg flex flex-wrap items-center justify-between gap-4 ${theme.bgCard}`}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              Aba de Suporte Inteligente (IA Autônoma)
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-normal">
                Aprendizado RAG Ativo
              </span>
            </h2>
            <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
              Sua dúvida é consultada em tempo real na nossa Base de Conhecimento e histórico de casos resolvidos.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNewTicketModal(true)}
          className="px-4 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-[#0284C7]/20"
        >
          <Plus className="w-4 h-4" />
          <span>Abrir Novo Chamado</span>
        </button>
      </div>

      {/* Main Support Grid (Tickets List + Active Chat Window) */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Tickets List */}
        <div className="space-y-3">
          <h3 className={`text-sm font-semibold px-1 ${theme.textMuted}`}>Meus Chamados</h3>

          {tickets.map((tkt) => (
            <div
              key={tkt.id}
              onClick={() => setActiveTicket(tkt)}
              className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                activeTicket?.id === tkt.id
                  ? "border-[#0284C7] bg-[#0284C7]/10"
                  : `${theme.bgCard} hover:border-[#0284C7]/50`
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-[#0284C7]">{tkt.id}</span>
                <span className={`text-[10px] font-mono ${theme.textMuted}`}>{tkt.createdAt}</span>
              </div>

              <h4 className="text-sm font-medium line-clamp-1">{tkt.subject}</h4>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className={`text-[11px] ${theme.textMuted}`}>{tkt.category}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> IA {tkt.aiConfidence}% Confiança
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Active Ticket Chat & Resolution */}
        <div className={`md:col-span-2 rounded-2xl border flex flex-col h-[560px] overflow-hidden shadow-lg ${theme.bgCard}`}>
          {/* Chat Header */}
          <div className={`p-4 border-b flex items-center justify-between ${theme.borderColor} ${theme.isDark ? "bg-[#1E293B]/40" : "bg-slate-50"}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#0284C7] font-semibold">{activeTicket?.id}</span>
                <h3 className="text-sm font-semibold">{activeTicket?.subject}</h3>
              </div>
              <span className={`text-xs block mt-0.5 ${theme.textMuted}`}>Categoria: {activeTicket?.category}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Atendido por IA
              </span>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${msg.sender === "USER" ? "ml-auto flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.sender === "USER"
                      ? theme.isDark
                        ? "bg-slate-700 text-white"
                        : "bg-slate-200 text-slate-700"
                      : "bg-[#F59E0B]/20 border border-[#F59E0B]/40 text-[#F59E0B]"
                  }`}
                >
                  {msg.sender === "USER" ? "RC" : <Sparkles className="w-4 h-4 text-[#F59E0B]" />}
                </div>

                <div
                  className={`p-3.5 rounded-2xl text-sm space-y-1.5 border ${
                    msg.sender === "USER"
                      ? "bg-[#0284C7] text-white border-transparent rounded-tr-none"
                      : `${innerSurface} rounded-tl-none`
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] opacity-80">
                    <span className="font-semibold">{msg.senderName}</span>
                    <span>{msg.time}</span>
                  </div>
                  <p className="leading-relaxed">{msg.content}</p>

                  {msg.confidence && (
                    <div className={`pt-2 border-t flex items-center justify-between text-[10px] ${theme.borderColor} ${theme.textMuted}`}>
                      <span>Baseado em {msg.confidence}% de similaridade em tickets fechados</span>
                      <div className="flex items-center gap-2">
                        <span>Esta resposta ajudou?</span>
                        <button className="hover:text-[#10B981] transition-colors"><ThumbsUp className="w-3 h-3" /></button>
                        <button className="hover:text-red-400 transition-colors"><ThumbsDown className="w-3 h-3" /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input */}
          <div className={`p-3 border-t flex items-center gap-2 ${theme.borderColor}`}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Digite sua dúvida ou resposta..."
              className={`flex-1 border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${inputClass}`}
            />
            <button
              onClick={handleSendMessage}
              className="p-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal for Creating New Ticket */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl ${theme.bgCard}`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.borderColor}`}>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-[#0284C7]" />
                Abrir Chamado de Suporte
              </h3>
              <button onClick={() => setShowNewTicketModal(false)} className={`text-sm ${theme.textMuted} hover:opacity-80`}>✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className={`text-xs font-medium ${theme.textMuted}`}>Assunto / Dúvida</label>
                <input
                  type="text"
                  value={newTicketSubject}
                  onChange={(e) => setNewTicketSubject(e.target.value)}
                  placeholder="Ex: Como faturar diárias para empresa?"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0284C7] ${inputClass}`}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${theme.textMuted}`}>Categoria</label>
                <select
                  value={newTicketCategory}
                  onChange={(e) => setNewTicketCategory(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0284C7] ${inputClass}`}
                >
                  <option>FNRH / Governo</option>
                  <option>WhatsApp</option>
                  <option>Faturamento Corporativo</option>
                  <option>Mapa de Quartos / Reservas</option>
                  <option>PDV & Consumo</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className={`text-xs font-medium ${theme.textMuted}`}>Descrição Detalhada</label>
                <textarea
                  rows={3}
                  value={newTicketMessage}
                  onChange={(e) => setNewTicketMessage(e.target.value)}
                  placeholder="Descreva o que ocorreu para a IA analisar a solução..."
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0284C7] ${inputClass}`}
                />
              </div>
            </div>

            <div className={`flex justify-end gap-3 pt-3 border-t ${theme.borderColor}`}>
              <button
                onClick={() => setShowNewTicketModal(false)}
                className={`px-4 py-2 text-sm rounded-lg ${secondaryBtn}`}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTicket}
                className="px-4 py-2 bg-[#0284C7] text-white text-sm rounded-lg font-medium hover:bg-[#0369A1]"
              >
                Enviar para Análise da IA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
