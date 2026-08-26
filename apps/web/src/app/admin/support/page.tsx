"use client";

import { useState } from "react";
import { LifeBuoy, Sparkles, Send, CheckCircle2, ShieldAlert, Check, RefreshCw, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";

export default function SuperAdminSupportPage() {
  const [tickets, setTickets] = useState([
    {
      id: "TKT-1083",
      tenantName: "Hotel Central Executivo",
      authorName: "Gerente Amanda",
      category: "Faturamento Corporativo",
      subject: "Dificuldade na configuração de Faturamento para Empresa Conveniada",
      priority: "HIGH",
      status: "OPEN",
      aiHandled: false,
      confidence: 62,
      createdAt: "Há 15 minutos",
      lastMessage: "Olá! Cadastrei o CNPJ da empresa mas no checkout não aparece a opção de faturar.",
    },
    {
      id: "TKT-1082",
      tenantName: "Pousada Sol & Mar",
      authorName: "Recepcionista Carlos",
      category: "FNRH / Governo",
      subject: "Dúvida na transmissão da FNRH para o SNRHos",
      priority: "HIGH",
      status: "RESOLVED_BY_AI",
      aiHandled: true,
      confidence: 94,
      createdAt: "Há 45 minutos",
      lastMessage: "IA de Suporte forneceu a solução sobre a janela de manutenção do SNRHos.",
    },
    {
      id: "TKT-1045",
      tenantName: "Hotel Praia Azul",
      authorName: "Recepção Praia",
      category: "WhatsApp",
      subject: "Como re-conectar QR Code da API do WhatsApp?",
      priority: "MEDIUM",
      status: "RESOLVED",
      aiHandled: true,
      confidence: 98,
      createdAt: "Ontem às 14:30",
      lastMessage: "Procedimento de reconexão validado.",
    },
  ]);

  const [activeTicket, setActiveTicket] = useState<any>(tickets[0]);
  const [replyInput, setReplyInput] = useState("");
  const [vectorizeNotification, setVectorizeNotification] = useState<string | null>(null);

  const [messages, setMessages] = useState([
    {
      sender: "USER",
      senderName: "Gerente Amanda (Hotel Central Executivo)",
      content: "Olá! Cadastrei o CNPJ da empresa Meta Consultoria mas ao tentar faturar as diárias no checkout do hóspede Carlos, a opção de faturar aparece desabilitada.",
      time: "10:45",
    },
    {
      sender: "AI_AGENT",
      senderName: "IA de Suporte Hoteis.Net (RAG Bot - 62% Confiança)",
      content: "Identificamos que para habilitar o faturamento corporativo, é necessário verificar se o contrato da empresa possui limite de crédito cadastrado superior a R$ 0,00.",
      time: "10:45",
      lowConfidence: true,
    },
  ]);

  const handleSendHumanReply = () => {
    if (!replyInput.trim()) return;

    const humanMsg = {
      sender: "SUPER_ADMIN",
      senderName: "Atendente Humano (Suporte SaaS)",
      content: replyInput,
      time: "Agora",
    };

    setMessages((prev) => [...prev, humanMsg]);
    setReplyInput("");

    // Update status
    setTickets((prev) =>
      prev.map((t) => (t.id === activeTicket.id ? { ...t, status: "IN_PROGRESS", aiHandled: false } : t))
    );
  };

  const handleResolveAndVectorize = () => {
    setVectorizeNotification(`Chamado ${activeTicket.id} resolvido e vetorizado no Supabase pgvector! A IA aprendeu com esta solução.`);
    setTickets((prev) =>
      prev.map((t) => (t.id === activeTicket.id ? { ...t, status: "RESOLVED" } : t))
    );

    setTimeout(() => {
      setVectorizeNotification(null);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-[#0284C7]" />
            Central Master de Gerenciamento de Suporte & Treinamento RAG
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Console de atendimento humano do SuperAdmin. As resoluções finalizadas são vetorizadas automaticamente no Supabase para a IA aprender.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#10B981]" /> Taxa Autônoma da IA: 88.5%
          </span>
        </div>
      </div>

      {/* Vectorize Alert Notification */}
      {vectorizeNotification && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{vectorizeNotification}</span>
        </div>
      )}

      {/* Master Console Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Tickets Queue */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 px-1">Fila Global de Tickets</h3>

          {tickets.map((tkt) => (
            <div
              key={tkt.id}
              onClick={() => setActiveTicket(tkt)}
              className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                activeTicket?.id === tkt.id
                  ? "border-[#F59E0B] bg-[#F59E0B]/10"
                  : "border-slate-800 bg-[#0F172A] hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-[#F59E0B]">{tkt.id}</span>
                <span className="text-[10px] text-slate-400 font-mono">{tkt.createdAt}</span>
              </div>

              <span className="text-xs font-bold text-white block">{tkt.tenantName}</span>
              <p className="text-xs text-slate-300 line-clamp-1">{tkt.subject}</p>

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-slate-400 text-[11px]">{tkt.category}</span>
                {tkt.aiHandled ? (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981]">IA ({tkt.confidence}%)</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> Humano Necessário
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Ticket Management & RAG Vectorizer */}
        <div className="md:col-span-2 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-col h-[560px] overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 bg-[#1E293B]/40 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#F59E0B] font-semibold">{activeTicket?.id}</span>
                <h3 className="text-sm font-semibold text-white">{activeTicket?.tenantName}</h3>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{activeTicket?.subject}</p>
            </div>

            <button
              onClick={handleResolveAndVectorize}
              className="px-3.5 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-[#10B981]/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Resolver & Vetorizar RAG</span>
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${msg.sender === "SUPER_ADMIN" ? "ml-auto flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.sender === "SUPER_ADMIN"
                      ? "bg-[#F59E0B] text-slate-950"
                      : msg.sender === "USER"
                      ? "bg-slate-700 text-white"
                      : "bg-amber-500/20 text-[#F59E0B] border border-[#F59E0B]/40"
                  }`}
                >
                  {msg.sender === "SUPER_ADMIN" ? "ADM" : msg.sender === "USER" ? "HT" : <Sparkles className="w-4 h-4" />}
                </div>

                <div
                  className={`p-3.5 rounded-2xl text-sm space-y-1.5 ${
                    msg.sender === "SUPER_ADMIN"
                      ? "bg-[#F59E0B]/15 border border-[#F59E0B]/30 text-white rounded-tr-none"
                      : msg.sender === "USER"
                      ? "bg-slate-800 text-slate-200 rounded-tl-none"
                      : "bg-[#1E293B] text-amber-300 border border-amber-500/30 rounded-tl-none"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] opacity-80">
                    <span className="font-semibold">{msg.senderName}</span>
                    <span>{msg.time}</span>
                  </div>
                  <p className="leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>

          {/* SuperAdmin Reply Input */}
          <div className="p-3 border-t border-slate-800 bg-[#0F172A] flex items-center gap-2">
            <input
              type="text"
              value={replyInput}
              onChange={(e) => setReplyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendHumanReply()}
              placeholder="Digite a resposta oficial do suporte do SaaS..."
              className="flex-1 bg-[#1E293B] border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
            />
            <button
              onClick={handleSendHumanReply}
              className="px-4 py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-bold rounded-lg text-sm transition-colors flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" /> Responder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
