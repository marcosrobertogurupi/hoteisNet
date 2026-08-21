"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { BookOpen, Plus, Trash2, X, Bot, ShieldCheck } from "lucide-react";

interface KnowledgeEntry {
  id: string;
  agentType: "SUPPORT" | "OPERATIONAL";
  sourceType: string;
  title: string;
  category: string;
  question: string;
  resolution: string;
  createdAt: string;
}

export default function BaseConhecimentoPage() {
  const { theme } = useTheme();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [resolution, setResolution] = useState("");
  const [agentType, setAgentType] = useState<"SUPPORT" | "OPERATIONAL">("SUPPORT");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setIsLoading(true);
    fetch("/api/tenant/knowledge-base")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setEntries(data.entries);
        else setError(data.error || "Erro ao carregar base de conhecimento.");
      })
      .catch(() => setError("Erro de rede ao carregar base de conhecimento."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setQuestion("");
    setResolution("");
    setAgentType("SUPPORT");
  };

  const handleSave = async () => {
    if (!title.trim() || !category.trim() || !question.trim() || !resolution.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, question, resolution, agentType, sourceType: "MANUAL" }),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        resetForm();
        load();
      } else {
        setError(data.error || "Erro ao salvar.");
      }
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tenant/knowledge-base/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-6 shadow-lg flex flex-wrap items-center justify-between gap-4 ${theme.bgCard}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Base de Conhecimento</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Perguntas e respostas validadas que o Agente de Atendimento e o Agente Operacional consultam antes de
              responder ou alertar — é assim que eles "aprendem" com o tempo, sem depender de re-treino do modelo.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Adicionar Conhecimento
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}

      <div className={`rounded-2xl border overflow-hidden shadow-lg ${theme.bgCard}`}>
        {isLoading ? (
          <p className="p-6 text-center text-sm opacity-60">Carregando...</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-sm opacity-60">
            Nenhum conhecimento salvo ainda. Adicione perguntas frequentes e respostas certas para os agentes reaproveitarem.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/30">
            {entries.map((e) => (
              <div key={e.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {e.agentType === "SUPPORT" ? (
                      <Bot className="w-4 h-4 text-violet-500 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold text-sm">{e.title}</span>
                      <span className={`block text-[10px] ${theme.textMuted}`}>
                        {e.category} · {e.agentType === "SUPPORT" ? "Agente de Atendimento" : "Agente Operacional"}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-slate-500 hover:text-red-500 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs"><span className="font-semibold">Pergunta:</span> {e.question}</p>
                <p className="text-xs"><span className="font-semibold">Resposta:</span> {e.resolution}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border ${theme.bgCard}`}>
            <div className="flex items-center justify-between border-b border-slate-800/30 pb-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" /> Novo Conhecimento
              </h3>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 opacity-60" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold">Agente</label>
                <select
                  value={agentType}
                  onChange={(e) => setAgentType(e.target.value as "SUPPORT" | "OPERATIONAL")}
                  className="w-full border rounded-lg px-3 py-2 bg-transparent"
                >
                  <option value="SUPPORT">Agente de Atendimento (WhatsApp)</option>
                  <option value="OPERATIONAL">Agente Operacional (monitoramento)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Título curto</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Categoria</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Café da manhã, Wi-Fi, Estacionamento" className="w-full border rounded-lg px-3 py-2 bg-transparent" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Pergunta (como o hóspede costuma perguntar)</label>
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
              </div>
              <div className="space-y-1">
                <label className="font-semibold">Resposta certa</label>
                <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800/30">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg opacity-70 hover:opacity-100">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-sm rounded-lg font-bold"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
