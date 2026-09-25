"use client";

import { useCallback, useEffect, useState } from "react";
import { Zap, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../principal/cadastros/_ui";

const c = cadastroUI(false);

type Mode = "OFF" | "SHADOW" | "ACTIVE";
interface Breakdown {
  decision: string | null;
  observedOutcome: string | null;
  count: number;
}
interface FeatureRow {
  key: string;
  label: string;
  description: string;
  mode: Mode;
  model: string;
  activeAvailable: boolean;
  stats: { decisions: number; errors: number; avgDurationMs: number | null; costUsd: number; breakdown: Breakdown[] };
}

const MODE_LABEL: Record<Mode, string> = {
  OFF: "Desligado",
  SHADOW: "Observação — decide e registra, mas não age",
  ACTIVE: "Ativo — a decisão muda o atendimento",
};
const DECISION_LABEL: Record<string, string> = {
  escalate: "chamaria um atendente",
  farewell: "só despediria",
  agent: "seguiria para o agente",
};
const OUTCOME_LABEL: Record<string, string> = {
  escalated: "o agente escalou",
  replied: "o agente respondeu",
  no_reply: "o agente não respondeu",
  agent_error: "o agente falhou",
};

export default function JevSettings({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [statsDays, setStatsDays] = useState(7);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/admin/jev").then((r) => r.json());
      if (d?.success) {
        setFeatures(d.features);
        setKeyConfigured(d.keyConfigured);
        setStatsDays(d.statsDays);
      } else toast.error(d?.error || "Erro ao carregar decisões rápidas.");
    } catch {
      toast.error("Falha de rede ao carregar decisões rápidas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveMode = async (feature: string, mode: Mode) => {
    setSavingKey(feature);
    try {
      const res = await fetch("/api/admin/jev", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, mode }),
      });
      const j = await res.json();
      if (j?.success) {
        toast.success("Modo atualizado (vale em até 1 minuto).");
        await load();
      } else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className={`${c.tableCard} p-8 text-center ${c.empty}`}>
        <Loader2 className="w-5 h-5 animate-spin inline" /> Carregando decisões rápidas…
      </div>
    );
  }

  return (
    <div className={`${c.tableCard} overflow-hidden`}>
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <Zap className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-900">Decisões rápidas (Jev)</h3>
      </div>
      <p className="px-4 pt-3 text-[11px] text-slate-500">
        Um modelo que só decide (não escreve), em meio segundo e por uma fração do custo, antes da IA de texto. Comece
        em <b>Observação</b>: ele registra o que faria e comparamos com o que realmente aconteceu antes de deixá-lo agir.
      </p>
      {!keyConfigured && (
        <div className="mx-4 mt-3 p-2 rounded border border-amber-300 bg-amber-50 text-[11px] text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Chave do OpenRouter não configurada neste ambiente — as
          decisões vão falhar e o atendimento segue normalmente, sem elas.
        </div>
      )}
      <div className="divide-y divide-slate-200 mt-2">
        {features.map((f) => (
          <div key={f.key} className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="md:w-1/2">
                <div className="text-sm font-medium text-slate-800">{f.label}</div>
                <div className="text-[11px] text-slate-400">{f.description}</div>
              </div>
              <div className="md:w-1/2">
                <select
                  className={c.field}
                  value={f.mode}
                  disabled={!canEdit || savingKey === f.key}
                  onChange={(e) => saveMode(f.key, e.target.value as Mode)}
                >
                  {(["OFF", "SHADOW", "ACTIVE"] as Mode[]).map((m) => (
                    <option key={m} value={m} disabled={m === "ACTIVE" && !f.activeAvailable}>
                      {MODE_LABEL[m]}
                      {m === "ACTIVE" && !f.activeAvailable ? " (disponível numa próxima etapa)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              Últimos {statsDays} dias: <b>{f.stats.decisions}</b> decisões
              {f.stats.avgDurationMs != null && <> · média {f.stats.avgDurationMs} ms</>} · custo US${" "}
              {f.stats.costUsd.toFixed(5)}
              {f.stats.errors > 0 && <span className="text-amber-600"> · {f.stats.errors} falhas</span>}
            </div>
            {f.stats.breakdown.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px]">
                {f.stats.breakdown
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((b, i) => (
                    <div key={i} className="flex justify-between gap-2 px-2 py-1 rounded bg-slate-50 text-slate-600">
                      <span>
                        Jev {DECISION_LABEL[b.decision ?? ""] ?? "sem decisão (falha)"} →{" "}
                        {OUTCOME_LABEL[b.observedOutcome ?? ""] ?? "desfecho não registrado"}
                      </span>
                      <b>{b.count}</b>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
