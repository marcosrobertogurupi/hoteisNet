"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Aberto", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  IN_PROGRESS: { label: "Em atendimento", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  AI_ANSWERED: { label: "Respondido pela IA", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  RESOLVED: { label: "Resolvido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CLOSED: { label: "Fechado", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const PRIORITY_LABEL: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", URGENT: "Urgente" };

interface Row {
  id: string; subject: string; category: string; priority: string; status: string;
  tenantName: string; authorName: string; messages: number; createdAt: string; updatedAt: string;
}
interface Msg { id: string; senderType: string; senderName: string; content: string; createdAt: string; }
interface Detail {
  id: string; subject: string; category: string; priority: string; status: string; createdAt: string;
  tenantName: string; author: { name: string; email: string }; messages: Msg[];
}

export default function AdminSupportPage() {
  const toast = useToast();
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => { if (d?.success) setCanEdit(!!d.user.canEdit); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      const d = await fetch(`/api/admin/support/tickets?${p}`).then((r) => r.json());
      if (d?.success) { setRows(d.tickets); setOpenCount(d.openCount); }
    } catch {
      toast.error("Falha ao carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const open = async (id: string) => {
    const d = await fetch(`/api/admin/support/tickets/${id}`).then((r) => r.json());
    if (d?.success) setSel(d.ticket);
    else toast.error(d?.error || "Erro ao abrir.");
  };

  const send = async (resolve = false) => {
    if (!sel || (!reply.trim() && !resolve)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${sel.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply.trim() || "Chamado resolvido pela equipe.", resolve }),
      });
      const d = await res.json();
      if (d?.success) { setReply(""); await open(sel.id); await load(); }
      else toast.error(d?.error || "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (data: Record<string, string>) => {
    if (!sel) return;
    const res = await fetch(`/api/admin/support/tickets/${sel.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const d = await res.json();
    if (d?.success) { await open(sel.id); await load(); }
    else toast.error(d?.error || "Erro ao atualizar.");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl"><LifeBuoy className="w-7 h-7" /></div>
          <div>
            <h1 className={c.title}>Suporte aos assinantes</h1>
            <p className={c.subtitle}>Fila global de chamados. {openCount} em aberto.</p>
          </div>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${c.field} md:w-52`}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`${c.tableCard} overflow-hidden lg:max-h-[70vh] lg:overflow-y-auto`}>
          {loading ? (
            <div className="py-16 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
          ) : rows.length === 0 ? (
            <div className={`py-16 text-center ${c.empty} text-sm`}>Nenhum chamado.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {rows.map((t) => {
                const sm = STATUS_META[t.status] || STATUS_META.OPEN;
                return (
                  <button key={t.id} onClick={() => open(t.id)}
                    className={`w-full text-left p-4 hover:bg-slate-50 ${sel?.id === t.id ? "bg-sky-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">{t.tenantName}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${sm.cls}`}>{sm.label}</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">{t.subject}</p>
                    <div className="text-[10px] text-slate-400 mt-1">{t.category} · {PRIORITY_LABEL[t.priority] || t.priority} · {t.messages} msg</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={`${c.tableCard} lg:col-span-2 flex flex-col lg:h-[70vh]`}>
          {!sel ? (
            <div className={`flex-1 flex items-center justify-center ${c.empty} text-sm`}>Selecione um chamado.</div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{sel.subject}</h2>
                    <span className="text-[11px] text-slate-500">{sel.tenantName} · {sel.author.name} ({sel.author.email}) · {sel.category}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <select value={sel.priority} onChange={(e) => patch({ priority: e.target.value })} className={`${c.field} !w-28 !py-1 text-[11px]`}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                      </select>
                      <select value={sel.status} onChange={(e) => patch({ status: e.target.value })} className={`${c.field} !w-36 !py-1 text-[11px]`}>
                        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sel.messages.map((m) => {
                  const platform = m.senderType === "PLATFORM";
                  return (
                    <div key={m.id} className={`flex ${platform ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${platform ? "bg-sky-600 text-white rounded-br-sm" : m.senderType === "AI" ? "bg-violet-50 text-violet-900 border border-violet-200 rounded-bl-sm" : "bg-slate-100 text-slate-800 rounded-bl-sm"}`}>
                        <div className={`text-[10px] mb-1 ${platform ? "text-sky-100" : "text-slate-400"}`}>{m.senderName} · {new Date(m.createdAt).toLocaleString("pt-BR")}</div>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {canEdit && (
                <div className="p-3 border-t border-slate-200 flex items-center gap-2">
                  <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Resposta oficial do suporte…" className={c.field} />
                  <button onClick={() => send(false)} disabled={busy} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                  <button onClick={() => send(true)} disabled={busy} title="Responder e marcar como resolvido" className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> resolver
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
