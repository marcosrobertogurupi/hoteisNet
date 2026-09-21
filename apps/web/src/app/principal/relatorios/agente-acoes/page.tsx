"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { Bot, CalendarX2, CalendarCheck2, Send, RotateCcw, MessageCircleWarning, ListChecks, BookOpen } from "lucide-react";

interface AgentAction {
  id: string;
  action: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof Bot }> = {
  AGENT_RESERVATION_CREATE: { label: "Reserva criada", icon: CalendarCheck2 },
  AGENT_RESERVATION_CANCEL: { label: "Reserva cancelada", icon: CalendarX2 },
  AGENT_FNRH_RESEND: { label: "Link de pré-check-in reenviado", icon: Send },
  AGENT_FNRH_RETRY_RESET: { label: "Nova chance de envio à FNRH", icon: RotateCcw },
  AGENT_HOUSEKEEPING_NUDGE: { label: "Governanta avisada", icon: MessageCircleWarning },
  AGENT_KB_UPDATE: { label: "Valor corrigido na Base de Conhecimento", icon: BookOpen },
};

export default function AgenteAcoesPage() {
  const { theme } = useTheme();
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tenant/agent-actions")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setActions(data.actions);
        else setError(data.error || "Erro ao carregar ações do agente.");
      })
      .catch(() => setError("Erro de rede ao carregar ações do agente."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-6 shadow-lg flex items-center gap-3 ${theme.bgCard}`}>
        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500">
          <ListChecks className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Ações do Agente</h1>
          <p className={`text-xs ${theme.textMuted}`}>
            Histórico do que o Agente de Atendimento e o Agente Operacional já fizeram sozinhos — reservas criadas ou
            canceladas, links reenviados, avisos à governança. Últimas 100 ações.
          </p>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}

      <div className={`rounded-2xl border overflow-hidden shadow-lg ${theme.bgCard}`}>
        {isLoading ? (
          <p className="p-6 text-center text-sm opacity-60">Carregando...</p>
        ) : actions.length === 0 ? (
          <p className="p-6 text-center text-sm opacity-60">Nenhuma ação autônoma registrada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-800/30">
            {actions.map((a) => {
              const meta = ACTION_META[a.action] || { label: a.action, icon: Bot };
              const Icon = meta.icon;
              return (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <Icon className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{meta.label}</span>
                      <span className={`text-[10px] ${theme.textMuted}`}>
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {a.description && <p className="text-xs mt-1">{a.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
