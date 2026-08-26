"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, User, MessageSquare, DoorClosed } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export interface CleaningHistoryEntry {
  id: string;
  outcome: "CLEANED" | "DND";
  housekeeperName: string;
  finishedAt: string;
  notes: string | null;
}

interface HistoricoLimpezaModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  roomNumber: string;
}

function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Histórico de governança do quarto durante a hospedagem ATUAL — arrumações feitas (quem limpou,
// quando, observação) e registros de "não perturbe" deixados pela governanta no app dela. Nunca
// mostra duração — esse dado é só para o relatório de governança da gerência.
export default function HistoricoLimpezaModal({ isOpen, onClose, roomId, roomNumber }: HistoricoLimpezaModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [loading, setLoading] = useState(false);
  const [hasActiveStay, setHasActiveStay] = useState(true);
  const [cleanings, setCleanings] = useState<CleaningHistoryEntry[]>([]);

  useEffect(() => {
    if (!isOpen || !roomId) return;
    setLoading(true);
    fetch(`/api/tenant/room-cleaning-history?roomId=${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setHasActiveStay(data.hasActiveStay);
          setCleanings(data.cleanings || []);
        }
      })
      .catch((e) => console.error("Erro ao buscar histórico de limpeza:", e))
      .finally(() => setLoading(false));
  }, [isOpen, roomId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border shadow-2xl max-h-[85vh] flex flex-col ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className={`flex items-center justify-between p-5 border-b shrink-0 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Histórico de Governança do Quarto</h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>Quarto {roomNumber} — hospedagem atual</p>
            </div>
          </div>
          <button onClick={onClose} className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {loading && (
            <p className={`text-sm text-center py-8 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Carregando...</p>
          )}

          {!loading && !hasActiveStay && (
            <p className={`text-sm text-center py-8 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Este quarto não está com hospedagem ativa.
            </p>
          )}

          {!loading && hasActiveStay && cleanings.length === 0 && (
            <p className={`text-sm text-center py-8 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Nenhum registro de governança durante esta hospedagem ainda.
            </p>
          )}

          {!loading &&
            cleanings.map((c) => {
              const isDnd = c.outcome === "DND";
              return (
                <div key={c.id} className={`p-3.5 rounded-xl border space-y-1.5 ${isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-1.5 text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      <User className="w-3.5 h-3.5 text-violet-500" />
                      {c.housekeeperName}
                    </span>
                    <span className={`text-[11px] font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {formatDateTimeBR(c.finishedAt)}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      isDnd
                        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                        : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    }`}
                  >
                    {isDnd ? <DoorClosed className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    {isDnd ? "Não perturbe" : "Arrumado"}
                  </span>
                  {c.notes && (
                    <p className={`flex items-start gap-1.5 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                      {c.notes}
                    </p>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
