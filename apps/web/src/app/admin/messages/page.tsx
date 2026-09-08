"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, Loader2, Users, Building2, User, FileText, Mic } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

const KIND_LABEL: Record<string, string> = { TEXT: "Texto", DOCUMENT: "Documento", AUDIO: "Áudio" };
const STATUS_LABEL: Record<string, string> = { TRIAL: "Degustação", ACTIVE: "Ativos", OVERDUE: "Inadimplentes", SUSPENDED: "Suspensos", CANCELLED: "Cancelados" };

interface Tenant { id: string; name: string; tradeName: string | null; }
interface UserRow { id: string; name: string; role: string; phone: string | null; }
interface Log {
  id: string; tenantId: string | null; targetPhone: string; targetLabel: string | null; kind: string;
  body: string | null; mediaFilename: string | null; status: string; error: string | null; sentByName: string | null; createdAt: string; batchId: string | null;
}

export default function AdminMessagesPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [canEdit, setCanEdit] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState<"tenant" | "user" | "segment">("tenant");
  const [tenantId, setTenantId] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState("");
  const [segPlan, setSegPlan] = useState("");
  const [segStatus, setSegStatus] = useState("");
  const [kind, setKind] = useState<"TEXT" | "DOCUMENT" | "AUDIO">("TEXT");
  const [textMsg, setTextMsg] = useState("");
  const [media, setMedia] = useState<{ dataUri: string; name: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => { if (d?.success) setCanEdit(!!d.user.canEdit); }).catch(() => {});
    fetch("/api/admin/tenants?pageSize=200").then((r) => r.json()).then((d) => { if (d?.success) setTenants(d.tenants); }).catch(() => {});
    fetch("/api/admin/plans").then((r) => r.json()).then((d) => { if (d?.success) setPlans(d.plans.map((p: any) => p.name)); }).catch(() => {});
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/messages").then((r) => r.json());
      if (d?.success) { setLogs(d.logs); setConfigured(d.configured); }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (scope === "user" && tenantId) {
      fetch(`/api/admin/tenants/${tenantId}/users`).then((r) => r.json()).then((d) => { if (d?.success) setUsers(d.users); }).catch(() => {});
    }
  }, [scope, tenantId]);

  const pickFile = (f: File | null) => {
    if (!f) { setMedia(null); return; }
    if (f.size > 5 * 1024 * 1024) { toast.warning("Arquivo acima de 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setMedia({ dataUri: String(reader.result), name: f.name });
    reader.readAsDataURL(f);
  };

  const buildPayload = (dryRun = false) => ({
    scope,
    dryRun,
    userId: scope === "user" ? userId : undefined,
    tenantId: scope !== "segment" ? tenantId : undefined,
    segment: scope === "segment" ? { plan: segPlan || undefined, status: segStatus || undefined } : undefined,
    kind,
    text: textMsg.trim() || undefined,
    mediaBase64: kind !== "TEXT" ? media?.dataUri : undefined,
    mediaFilename: kind !== "TEXT" ? media?.name : undefined,
  });

  const send = async () => {
    if (kind === "TEXT" && !textMsg.trim()) { toast.warning("Escreva a mensagem."); return; }
    if (kind !== "TEXT" && !media) { toast.warning("Anexe o arquivo."); return; }
    if (scope !== "segment" && !tenantId) { toast.warning("Escolha o assinante."); return; }
    if (scope === "user" && !userId) { toast.warning("Escolha a pessoa."); return; }

    // Prévia dos destinatários
    let count = 1;
    try {
      const dry = await fetch("/api/admin/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload(true)) }).then((r) => r.json());
      if (!dry?.success) { toast.error(dry?.error || "Não foi possível preparar o envio."); return; }
      count = dry.count;
    } catch { toast.error("Falha de rede."); return; }

    const ok = await confirmDialog({
      title: "Confirmar envio",
      message: `A mensagem (${KIND_LABEL[kind]}) será enviada para ${count} destinatário(s) via WhatsApp da plataforma.`,
      confirmLabel: `Enviar para ${count}`,
    });
    if (!ok) return;

    setSending(true);
    try {
      const d = await fetch("/api/admin/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload(false)) }).then((r) => r.json());
      if (!d?.success) { toast.error(d?.error || "Erro no envio."); return; }
      toast.success(`${d.sent} enviada(s)${d.failed ? `, ${d.failed} falha(s)` : ""}.`);
      setTextMsg(""); setMedia(null);
      await loadLogs();
    } finally {
      setSending(false);
    }
  };

  const input = c.field;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl"><MessageSquare className="w-7 h-7" /></div>
          <div>
            <h1 className={c.title}>Mensagens aos assinantes</h1>
            <p className={c.subtitle}>Envio por WhatsApp da plataforma — 1:1 (assinante ou pessoa) ou em massa por segmento.
              {!configured && " Instância WhatsApp da plataforma não configurada (UAZAPI_FALLBACK_*)."}</p>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className={`${c.tableCard} p-5 space-y-4`}>
          <div className="flex gap-2">
            {([["tenant", "Um assinante", Building2], ["user", "Uma pessoa", User], ["segment", "Segmento", Users]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setScope(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${scope === k ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200"}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {scope !== "segment" && (
              <div className="space-y-1">
                <label className={c.label}>Assinante</label>
                <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setUserId(""); }} className={input}>
                  <option value="">Selecione…</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.tradeName || t.name}</option>)}
                </select>
              </div>
            )}
            {scope === "user" && (
              <div className="space-y-1">
                <label className={c.label}>Pessoa</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={input} disabled={!tenantId}>
                  <option value="">Selecione…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}{u.phone ? "" : " (sem telefone → usa o do hotel)"}</option>)}
                </select>
              </div>
            )}
            {scope === "segment" && (
              <>
                <div className="space-y-1">
                  <label className={c.label}>Plano</label>
                  <select value={segPlan} onChange={(e) => setSegPlan(e.target.value)} className={input}>
                    <option value="">Todos os planos</option>
                    {plans.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className={c.label}>Situação</label>
                  <select value={segStatus} onChange={(e) => setSegStatus(e.target.value)} className={input}>
                    <option value="">Todas as situações</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className={c.label}>Tipo</label>
              <select value={kind} onChange={(e) => { setKind(e.target.value as any); setMedia(null); }} className={input}>
                <option value="TEXT">Texto</option>
                <option value="DOCUMENT">Documento (PDF / imagem)</option>
                <option value="AUDIO">Áudio</option>
              </select>
            </div>
          </div>

          {kind !== "TEXT" && (
            <div className="flex items-center gap-3 text-xs">
              {kind === "DOCUMENT" ? <FileText className="w-4 h-4 text-slate-500" /> : <Mic className="w-4 h-4 text-slate-500" />}
              <input type="file" accept={kind === "DOCUMENT" ? ".pdf,.png,.jpg,.jpeg" : "audio/*"} onChange={(e) => pickFile(e.target.files?.[0] || null)} className="text-xs" />
              {media && <span className="text-slate-500">{media.name}</span>}
            </div>
          )}

          <div className="space-y-1">
            <label className={c.label}>{kind === "TEXT" ? "Mensagem" : "Legenda (opcional)"}</label>
            <textarea rows={3} value={textMsg} onChange={(e) => setTextMsg(e.target.value)} className={input} placeholder="Escreva a mensagem…" />
          </div>

          <div className="flex justify-end">
            <button onClick={send} disabled={sending} className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
            </button>
          </div>
        </div>
      )}

      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200"><h3 className="text-sm font-semibold text-slate-900">Histórico de envios</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr><th className="px-4 py-2.5">Quando</th><th className="px-4 py-2.5">Destinatário</th><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">Conteúdo</th><th className="px-4 py-2.5">Por</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className={`px-4 py-10 text-center ${c.empty}`}>Nenhuma mensagem enviada ainda.</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2.5 text-slate-700">{l.targetLabel || l.targetPhone}{l.batchId && <span className="text-[10px] text-slate-400"> · massa</span>}</td>
                  <td className="px-4 py-2.5 text-slate-600">{KIND_LABEL[l.kind] || l.kind}</td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate">{l.mediaFilename || l.body || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{l.sentByName || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${l.status === "SENT" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`} title={l.error || ""}>
                      {l.status === "SENT" ? "Enviada" : "Falha"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
