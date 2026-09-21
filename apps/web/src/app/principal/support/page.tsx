"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { LifeBuoy, Send, Plus, X, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto", IN_PROGRESS: "Em atendimento", AI_ANSWERED: "Respondido pela IA", RESOLVED: "Resolvido", CLOSED: "Fechado",
};

interface TicketRow {
  id: string; subject: string; category: string; status: string; authorName: string; messages: number; updatedAt: string;
}
interface Msg { id: string; senderType: string; senderName: string; content: string; createdAt: string; }
interface TicketDetail {
  id: string; subject: string; category: string; status: string; createdAt: string;
  author: { name: string }; messages: Msg[];
}

export default function TenantSupportPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const card = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200";
  const inputCls = `w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-sky-500" : "bg-white border border-slate-300 text-slate-900 focus:border-sky-500"}`;
  const subtle = isDark ? "text-slate-400" : "text-slate-500";

  const [list, setList] = useState<TicketRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<TicketDetail | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "", message: "" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/tenant/support/tickets").then((r) => r.json());
      if (d?.success) { setList(d.tickets); setCategories(d.categories); }
    } catch {
      toast.error("Falha ao carregar chamados.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openTicket = async (id: string) => {
    setOpenLoading(true);
    try {
      const d = await fetch(`/api/tenant/support/tickets/${id}`).then((r) => r.json());
      if (d?.success) setOpen(d.ticket);
      else toast.error(d?.error || "Erro ao abrir o chamado.");
    } finally {
      setOpenLoading(false);
    }
  };

  const send = async () => {
    if (!open || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tenant/support/tickets/${open.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: reply }),
      });
      const d = await res.json();
      if (d?.success) { setReply(""); await openTicket(open.id); await load(); }
      else toast.error(d?.error || "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) { toast.warning("Preencha assunto e mensagem."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/tenant/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d?.success) { toast.error(d?.error || "Não foi possível abrir o chamado."); return; }
      toast.success("Chamado aberto. Nossa equipe vai responder por aqui.");
      setModal(false);
      setForm({ subject: "", category: "", message: "" });
      await load();
      openTicket(d.ticketId);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain}`}>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className={`p-6 rounded-2xl border flex items-center justify-between ${card}`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-50 text-sky-600"}`}><LifeBuoy className="w-7 h-7" /></div>
            <div>
              <h1 className="text-xl font-bold">Suporte Hoteis.Net</h1>
              <p className={`text-xs ${subtle}`}>Abra um chamado e acompanhe a resposta da nossa equipe por aqui.</p>
            </div>
          </div>
          {!open && (
            <button onClick={() => setModal(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo chamado
            </button>
          )}
        </div>

        {open ? (
          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            <div className={`p-4 border-b ${isDark ? "border-slate-800" : "border-slate-200"} flex items-center gap-3`}>
              <button onClick={() => setOpen(null)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}><ArrowLeft className="w-4 h-4" /></button>
              <div className="min-w-0">
                <h2 className="text-sm font-bold truncate">{open.subject}</h2>
                <span className={`text-[11px] ${subtle}`}>{open.category} · {STATUS_LABEL[open.status] || open.status}</span>
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[52vh] overflow-y-auto">
              {open.messages.map((m) => {
                const mine = m.senderType === "TENANT";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${mine ? "bg-sky-600 text-white rounded-br-sm" : isDark ? "bg-slate-800 text-slate-100 rounded-bl-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"}`}>
                      <div className={`text-[10px] mb-1 ${mine ? "text-sky-100" : subtle}`}>{m.senderName} · {new Date(m.createdAt).toLocaleString("pt-BR")}</div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {!["RESOLVED", "CLOSED"].includes(open.status) ? (
              <div className={`p-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"} flex items-center gap-2`}>
                <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva sua mensagem…" className={inputCls} />
                <button onClick={send} disabled={sending} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className={`p-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"} text-xs ${subtle} flex items-center gap-2`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Chamado {STATUS_LABEL[open.status].toLowerCase()}. Responda para reabrir se precisar.
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reabrir com uma mensagem…" className={`${inputCls} ml-auto max-w-xs`} />
                <button onClick={send} disabled={sending || !reply.trim()} className="px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs disabled:opacity-40">enviar</button>
              </div>
            )}
          </div>
        ) : (
          <div className={`rounded-2xl border overflow-hidden ${card}`}>
            {loading ? (
              <div className={`py-16 text-center ${subtle}`}><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
            ) : list.length === 0 ? (
              <div className={`py-16 text-center ${subtle} text-sm`}>Nenhum chamado ainda. Abra o primeiro no botão acima.</div>
            ) : (
              <div className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                {list.map((t) => (
                  <button key={t.id} onClick={() => openTicket(t.id)} disabled={openLoading}
                    className={`w-full text-left p-4 flex items-center justify-between gap-3 ${isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-50"}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{t.subject}</div>
                      <div className={`text-[11px] ${subtle}`}>{t.category} · {t.messages} mensagem(ns) · {new Date(t.updatedAt).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      t.status === "RESOLVED" || t.status === "CLOSED" ? "bg-emerald-500/15 text-emerald-500"
                      : t.status === "IN_PROGRESS" ? "bg-sky-500/15 text-sky-500" : "bg-amber-500/15 text-amber-500"
                    }`}>{STATUS_LABEL[t.status] || t.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-2xl border ${card} p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Abrir chamado</h2>
              <button onClick={() => setModal(false)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Assunto" required className={inputCls} />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                <option value="">Categoria…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} placeholder="Descreva o que está acontecendo…" required className={inputCls} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>Cancelar</button>
                <button type="submit" disabled={creating} className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                  {creating ? "Enviando…" : "Abrir chamado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
