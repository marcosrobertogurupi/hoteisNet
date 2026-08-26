"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import {
  BookOpen,
  Plus,
  Trash2,
  X,
  Bot,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Pencil,
  Archive,
  Undo2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import {
  KNOWLEDGE_TOPIC_ORDER as TOPIC_ORDER,
  KNOWLEDGE_TOPIC_LABEL as TOPIC_LABEL,
  type KnowledgeTopicKeyName as TopicKey,
} from "@/lib/knowledgeTopicLabels";
import { KNOWLEDGE_TOPIC_GUIDE_BY_KEY } from "@/lib/knowledgeTopics";

const STALE_DAYS = 90;

interface Topic {
  id: string;
  topicKey: TopicKey;
  title: string;
  content: string;
  active: boolean;
  lastReviewedAt: string | null;
  lastReviewedByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

interface Entry {
  id: string;
  agentType: "SUPPORT" | "OPERATIONAL";
  sourceType: string;
  title: string;
  category: string;
  topicKey: TopicKey | null;
  question: string;
  resolution: string;
  status: "ACTIVE" | "PENDING_REVIEW" | "ARCHIVED";
  lastReviewedAt: string | null;
  updatedByName: string | null;
  createdAt: string;
}

interface Revision {
  id: string;
  targetType: "TOPIC" | "ENTRY";
  targetId: string;
  targetLabel: string;
  contentBefore: string;
  contentAfter: string;
  changeSource: "MANUAL" | "AGENT_SUPPORT" | "AGENT_OPERATIONAL";
  changedByName: string;
  reason: string | null;
  reverted: boolean;
  createdAt: string;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function BaseConhecimentoPage() {
  const { theme } = useTheme();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<TopicKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingTopic, setSavingTopic] = useState<string | null>(null);
  const [savedTopic, setSavedTopic] = useState<string | null>(null);

  const [showArchived, setShowArchived] = useState(false);

  // Modal de criar/editar entrada
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; entry?: Entry; topicKey?: TopicKey | null }>(null);
  const [form, setForm] = useState({
    title: "",
    category: "",
    question: "",
    resolution: "",
    agentType: "SUPPORT" as "SUPPORT" | "OPERATIONAL",
    topicKey: "" as "" | TopicKey,
  });
  const [saving, setSaving] = useState(false);

  // Histórico
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    fetch("/api/tenant/knowledge-base")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTopics(data.topics || []);
          setEntries(data.entries || []);
          setDrafts(Object.fromEntries((data.topics || []).map((t: Topic) => [t.topicKey, t.content])));
        } else {
          setError(data.error || "Erro ao carregar base de conhecimento.");
        }
      })
      .catch(() => setError("Erro de rede ao carregar base de conhecimento."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadHistory = useCallback(() => {
    setLoadingHistory(true);
    fetch("/api/tenant/knowledge-base/revisions")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRevisions(data.revisions || []);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  const suggestions = useMemo(() => entries.filter((e) => e.status === "PENDING_REVIEW"), [entries]);
  const entriesByTopic = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.status === "PENDING_REVIEW") continue;
      if (e.status === "ARCHIVED" && !showArchived) continue;
      const key = e.topicKey || "__none__";
      const list = map.get(key) || [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [entries, showArchived]);
  const archivedCount = useMemo(() => entries.filter((e) => e.status === "ARCHIVED").length, [entries]);

  // --- ações de tópico ---
  const saveTopic = async (t: Topic, opts?: { markReviewed?: boolean }) => {
    const content = drafts[t.topicKey] ?? t.content;
    setSavingTopic(t.topicKey);
    try {
      const res = await fetch(`/api/tenant/knowledge-base/topics/${t.topicKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Só marca como revisado se há conteúdo — não faz sentido "revisar" um tópico vazio.
        body: JSON.stringify({ content, markReviewed: (opts?.markReviewed && content.trim()) || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Erro ao salvar tópico.");
        return;
      }
      setSavedTopic(t.topicKey);
      setTimeout(() => setSavedTopic((s) => (s === t.topicKey ? null : s)), 1800);
      load();
    } catch {
      setError("Erro de rede ao salvar tópico.");
    } finally {
      setSavingTopic(null);
    }
  };

  const markReviewed = async (t: Topic) => {
    await fetch(`/api/tenant/knowledge-base/topics/${t.topicKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markReviewed: true }),
    });
    load();
  };

  // --- ações de entrada ---
  const openCreate = (topicKey?: TopicKey | null) => {
    setForm({ title: "", category: "", question: "", resolution: "", agentType: "SUPPORT", topicKey: topicKey || "" });
    setModal({ mode: "create", topicKey });
  };

  const openEdit = (entry: Entry) => {
    setForm({
      title: entry.title,
      category: entry.category,
      question: entry.question,
      resolution: entry.resolution,
      agentType: entry.agentType,
      topicKey: entry.topicKey || "",
    });
    setModal({ mode: "edit", entry });
  };

  const submitEntry = async () => {
    if (!form.title.trim() || !form.question.trim() || !form.resolution.trim()) return;
    setSaving(true);
    try {
      const isEdit = modal?.mode === "edit";
      const res = await fetch(
        isEdit ? `/api/tenant/knowledge-base/${modal!.entry!.id}` : "/api/tenant/knowledge-base",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            category: form.category,
            question: form.question,
            resolution: form.resolution,
            agentType: form.agentType,
            topicKey: form.topicKey || null,
            ...(isEdit && modal!.entry!.status === "PENDING_REVIEW" ? { status: "ACTIVE" } : {}),
          }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Erro ao salvar.");
        return;
      }
      setModal(null);
      load();
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const setEntryStatus = async (id: string, status: Entry["status"]) => {
    await fetch(`/api/tenant/knowledge-base/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteEntry = async (id: string) => {
    await fetch(`/api/tenant/knowledge-base/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const revert = async (revisionId: string) => {
    const res = await fetch(`/api/tenant/knowledge-base/revisions/${revisionId}/revert`, { method: "POST" });
    const data = await res.json();
    if (!data.success) {
      setError(data.error || "Erro ao desfazer.");
      return;
    }
    load();
    loadHistory();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-2xl border p-6 shadow-lg flex flex-wrap items-center justify-between gap-4 ${theme.bgCard}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Base de Conhecimento do Hotel</h1>
            <p className={`text-xs ${theme.textMuted} max-w-2xl`}>
              As informações que o agente de atendimento consulta antes de responder o hóspede pelo WhatsApp. Mantenha os
              12 tópicos atualizados — preços, horários, políticas e serviços mudam com frequência.
            </p>
          </div>
        </div>
        <button
          onClick={() => openCreate()}
          className="px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nova pergunta e resposta
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="p-6 text-center text-sm opacity-60">Carregando...</p>
      ) : (
        <>
          {/* Sugestões do agente (aparecem quando o agente registra algo que não soube responder) */}
          {suggestions.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold">Sugestões do agente — {suggestions.length} aguardando revisão</h2>
              </div>
              <p className={`text-[11px] ${theme.textMuted}`}>
                Perguntas que o agente não soube responder e encaminhou para a recepção. Escreva a resposta certa e aprove
                — só então o agente passa a reaproveitar.
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div key={s.id} className={`p-3 rounded-lg border ${theme.bgCard}`}>
                    <p className="text-xs font-semibold">{s.title}</p>
                    <p className="text-xs mt-1">
                      <span className="opacity-60">Pergunta do hóspede:</span> {s.question}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => openEdit(s)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Responder e aprovar
                      </button>
                      <button
                        onClick={() => deleteEntry(s.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] opacity-70 hover:opacity-100 border border-slate-500/30"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos por tópico */}
          <div className={`rounded-2xl border overflow-hidden shadow-lg ${theme.bgCard}`}>
            {TOPIC_ORDER.map((key) => {
              const topic = topics.find((t) => t.topicKey === key);
              if (!topic) return null;
              const isOpen = expanded === key;
              const rDays = daysSince(topic.lastReviewedAt);
              const stale = rDays === null || rDays > STALE_DAYS;
              const topicEntries = entriesByTopic.get(key) || [];
              return (
                <div key={key} className="border-b border-slate-800/20 last:border-b-0">
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-500/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                      <span className="font-semibold text-sm truncate">{topic.title}</span>
                      {topicEntries.length > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${theme.textMuted} bg-slate-500/10`}>
                          {topicEntries.length} P&R
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] shrink-0 flex items-center gap-1 ${
                        stale ? "text-amber-500" : theme.textMuted
                      }`}
                    >
                      {stale && <AlertTriangle className="w-3 h-3" />}
                      {rDays === null
                        ? "Nunca revisado"
                        : rDays === 0
                          ? "Revisado hoje"
                          : `Revisado há ${rDays} d`}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className={`text-[11px] leading-relaxed rounded-lg border p-3 whitespace-pre-line ${theme.isDark ? "bg-slate-900/50 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                        <span className="font-semibold block mb-1">O que preencher aqui</span>
                        {KNOWLEDGE_TOPIC_GUIDE_BY_KEY[key]}
                      </div>
                      <textarea
                        value={drafts[key] ?? topic.content}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        rows={10}
                        placeholder="Escreva aqui as informações reais do hotel para este tópico."
                        className={`w-full border rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-transparent ${
                          theme.isDark ? "border-slate-700" : "border-slate-300"
                        }`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => saveTopic(topic, { markReviewed: true })}
                          disabled={savingTopic === key}
                          className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          {savedTopic === key ? <Check className="w-3 h-3" /> : null}
                          {savingTopic === key ? "Salvando..." : savedTopic === key ? "Salvo" : "Salvar"}
                        </button>
                        <button
                          onClick={() => markReviewed(topic)}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-slate-500/30 opacity-80 hover:opacity-100"
                        >
                          Marcar como revisado (sem alterar)
                        </button>
                        <span className={`text-[10px] ${theme.textMuted}`}>
                          {!(drafts[key] ?? topic.content).trim()
                            ? "Vazio — o agente só usa este tópico depois que você preencher."
                            : topic.lastReviewedAt
                              ? `Última revisão: ${fmtDate(topic.lastReviewedAt)}${
                                  topic.lastReviewedByName ? ` por ${topic.lastReviewedByName}` : ""
                                }`
                              : "Preenchido, ainda não marcado como revisado."}
                        </span>
                      </div>

                      {/* P&R deste tópico */}
                      <div className="pt-2 border-t border-slate-800/20 space-y-2">
                        {topicEntries.map((e) => (
                          <EntryRow
                            key={e.id}
                            entry={e}
                            theme={theme}
                            onEdit={() => openEdit(e)}
                            onArchive={() => setEntryStatus(e.id, e.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED")}
                            onDelete={() => deleteEntry(e.id)}
                          />
                        ))}
                        <button
                          onClick={() => openCreate(key)}
                          className={`text-[11px] flex items-center gap-1 ${theme.textMuted} hover:text-violet-500`}
                        >
                          <Plus className="w-3 h-3" /> adicionar pergunta e resposta a este tópico
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* P&R sem tópico */}
          {(entriesByTopic.get("__none__") || []).length > 0 && (
            <div className={`rounded-2xl border p-4 shadow-lg space-y-2 ${theme.bgCard}`}>
              <h3 className="text-sm font-bold">Outras perguntas (sem tópico)</h3>
              {(entriesByTopic.get("__none__") || []).map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  theme={theme}
                  onEdit={() => openEdit(e)}
                  onArchive={() => setEntryStatus(e.id, e.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED")}
                  onDelete={() => deleteEntry(e.id)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px]">
            {archivedCount > 0 ? (
              <button onClick={() => setShowArchived((v) => !v)} className={`${theme.textMuted} hover:underline`}>
                {showArchived ? "ocultar" : "mostrar"} {archivedCount} entrada(s) arquivada(s)
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => {
                setShowHistory((v) => !v);
                if (!showHistory && revisions.length === 0) loadHistory();
              }}
              className={`${theme.textMuted} hover:text-violet-500 flex items-center gap-1`}
            >
              <History className="w-3.5 h-3.5" /> Histórico de alterações
            </button>
          </div>

          {/* Histórico */}
          {showHistory && (
            <div className={`rounded-2xl border p-4 shadow-lg space-y-2 ${theme.bgCard}`}>
              {loadingHistory ? (
                <p className="text-xs opacity-60 text-center py-3">Carregando...</p>
              ) : revisions.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-3">Nenhuma alteração registrada ainda.</p>
              ) : (
                revisions.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 text-xs py-1.5 border-b border-slate-800/20 last:border-0">
                    <div className="min-w-0">
                      <span className="font-semibold">{r.targetLabel}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                        r.changeSource === "AGENT_OPERATIONAL"
                          ? "bg-amber-500/15 text-amber-500"
                          : r.changeSource === "AGENT_SUPPORT"
                            ? "bg-violet-500/15 text-violet-500"
                            : "bg-slate-500/15 " + theme.textMuted
                      }`}>
                        {r.changeSource === "AGENT_OPERATIONAL"
                          ? "Agente Operacional"
                          : r.changeSource === "AGENT_SUPPORT"
                            ? "Agente de Atendimento"
                            : r.changedByName}
                      </span>
                      <span className={`block text-[10px] ${theme.textMuted}`}>
                        {fmtDateTime(r.createdAt)}
                        {r.reason ? ` · ${r.reason}` : ""}
                        {r.reverted ? " · desfeita" : ""}
                      </span>
                    </div>
                    {!r.reverted && (
                      <button
                        onClick={() => revert(r.id)}
                        className="shrink-0 text-[11px] flex items-center gap-1 opacity-70 hover:opacity-100 hover:text-violet-500"
                      >
                        <Undo2 className="w-3 h-3" /> Desfazer
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Modal criar/editar entrada */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border ${theme.bgCard}`}>
            <div className="flex items-center justify-between border-b border-slate-800/30 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" />
                {modal.mode === "edit"
                  ? modal.entry?.status === "PENDING_REVIEW"
                    ? "Responder e aprovar sugestão"
                    : "Editar pergunta e resposta"
                  : "Nova pergunta e resposta"}
              </h3>
              <button onClick={() => setModal(null)}>
                <X className="w-4 h-4 opacity-60" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold">Tópico</label>
                  <select
                    value={form.topicKey}
                    onChange={(e) => setForm((f) => ({ ...f, topicKey: e.target.value as "" | TopicKey }))}
                    className="w-full border rounded-lg px-3 py-2 bg-transparent"
                  >
                    <option value="">(sem tópico)</option>
                    {TOPIC_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {TOPIC_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-semibold">Agente</label>
                  <select
                    value={form.agentType}
                    onChange={(e) => setForm((f) => ({ ...f, agentType: e.target.value as "SUPPORT" | "OPERATIONAL" }))}
                    className="w-full border rounded-lg px-3 py-2 bg-transparent"
                  >
                    <option value="SUPPORT">Atendimento (WhatsApp)</option>
                    <option value="OPERATIONAL">Operacional (monitoramento)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Título curto</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Categoria <span className="opacity-50">(opcional)</span></label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Ex: Café da manhã, Wi-Fi, Estacionamento"
                  className="w-full border rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Pergunta (como o hóspede costuma perguntar)</label>
                <textarea
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Resposta certa</label>
                <textarea
                  value={form.resolution}
                  onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/30">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded-lg opacity-70 hover:opacity-100">
                Cancelar
              </button>
              <button
                onClick={submitEntry}
                disabled={saving}
                className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-sm rounded-lg font-bold"
              >
                {saving ? "Salvando..." : modal.mode === "edit" && modal.entry?.status === "PENDING_REVIEW" ? "Aprovar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  theme,
  onEdit,
  onArchive,
  onDelete,
}: {
  entry: Entry;
  theme: any;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        entry.status === "ARCHIVED" ? "opacity-50 border-slate-500/20" : "border-slate-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {entry.agentType === "SUPPORT" ? (
            <Bot className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span className="font-semibold text-xs truncate">{entry.title}</span>
          {entry.category && (
            <span className={`text-[10px] ${theme.textMuted} shrink-0`}>· {entry.category}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="text-slate-500 hover:text-violet-500" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onArchive} className="text-slate-500 hover:text-amber-500" title={entry.status === "ARCHIVED" ? "Reativar" : "Arquivar"}>
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="text-slate-500 hover:text-red-500" title="Excluir">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-[11px] mt-1">
        <span className="font-semibold">P:</span> {entry.question}
      </p>
      <p className="text-[11px]">
        <span className="font-semibold">R:</span> {entry.resolution}
      </p>
    </div>
  );
}
