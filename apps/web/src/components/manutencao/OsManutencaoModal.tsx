"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Wrench, X, Loader2, RefreshCw, UserCog, Ban, MessageCircle, Clock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useSession } from "@/context/SessionContext";
import {
  MAINTENANCE_FUNNEL,
  MAINTENANCE_STAGE_LABEL,
  formatMaintenanceDateTime,
  formatMaintenanceDuration,
  type MaintenanceStageValue,
} from "@/lib/maintenanceShared";

// "Ver OS" do Mapa de Quartos: funil da OS, dados do problema, situação do aviso por WhatsApp e a
// linha do tempo. A recepção só acompanha (e pode pedir o reenvio de um aviso que falhou) — avançar
// etapa é exclusivo do colaborador, pelo app dele. Admin pode reatribuir ou cancelar.

interface TicketEvent {
  id: string;
  type: "OPENED" | "STAGE_CHANGED" | "REASSIGNED" | "FORECAST_CHANGED" | "CANCELLED";
  fromStage: MaintenanceStageValue | null;
  toStage: MaintenanceStageValue | null;
  note: string | null;
  actorType: "USER" | "EMPLOYEE" | "SYSTEM";
  actorName: string;
  createdAt: string;
  waitReason: string | null;
}

interface TicketDetail {
  id: string;
  number: number;
  stage: MaintenanceStageValue;
  description: string;
  openedAt: string;
  openedByName: string;
  expectedReleaseAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  downtimeMinutes: number | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  notifyStatus: "PENDING" | "SENT" | "FAILED";
  notifiedAt: string | null;
  roomNumber: string;
  problemType: string;
  employeeId: string;
  employeeName: string;
  waitReason: string | null;
  events: TicketEvent[];
  photos: { id: string; url: string | null; createdAt: string; actorName: string }[];
}

export interface OsManutencaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | null;
  onChanged?: () => void;
}

const EVENT_LABEL: Record<TicketEvent["type"], string> = {
  OPENED: "OS aberta",
  STAGE_CHANGED: "Mudou de etapa",
  REASSIGNED: "Passada para outro colaborador",
  FORECAST_CHANGED: "Previsão de liberação alterada",
  CANCELLED: "OS cancelada",
};

export default function OsManutencaoModal({ isOpen, onClose, ticketId, onChanged }: OsManutencaoModalProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { isAdmin } = useSession();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "reassign" | "cancel">("view");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [newEmployeeId, setNewEmployeeId] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/manutencao/os/${ticketId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTicket(data.ticket);
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível carregar a OS.", "Manutenção");
      onClose();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!isOpen) return;
    setTicket(null);
    setMode("view");
    setNewEmployeeId("");
    setCancelReason("");
    load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const isOpenTicket = !!ticket && ["OPEN", "EVALUATING", "WAITING"].includes(ticket.stage);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    if (!ticketId || busy) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/manutencao/os/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Não foi possível concluir a ação.");
      toast.success(okMsg, `OS nº ${ticket?.number ?? ""}`);
      onChanged?.();
      return true;
    } catch (err: any) {
      toast.error(err.message || "Não foi possível concluir a ação.", "Manutenção");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openReassign = async () => {
    setMode("reassign");
    try {
      const res = await fetch("/api/manutencao/opcoes");
      const data = await res.json();
      if (data.success) setEmployees((data.employees || []).filter((e: { id: string }) => e.id !== ticket?.employeeId));
    } catch {
      toast.error("Não foi possível carregar os colaboradores.", "Manutenção");
    }
  };

  const doReassign = async () => {
    if (!newEmployeeId) return toast.warning("Escolha o novo colaborador.", "Campo obrigatório");
    const name = employees.find((e) => e.id === newEmployeeId)?.name || "o novo colaborador";
    if (await patch({ acao: "reatribuir", employeeId: newEmployeeId }, `OS passada para ${name}. Ele será avisado pelo WhatsApp.`)) {
      setMode("view");
      load();
    }
  };

  const doCancel = async () => {
    if (!cancelReason.trim()) return toast.warning("Informe o motivo do cancelamento.", "Campo obrigatório");
    if (await patch({ acao: "cancelar", motivo: cancelReason }, "OS cancelada. O quarto voltou à situação anterior.")) {
      onClose();
    }
  };

  const doResend = async () => {
    if (await patch({ acao: "reenviar-aviso" }, "O aviso será reenviado pelo WhatsApp em instantes.")) load();
  };

  const card = `rounded-lg border p-3 space-y-2 ${theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`;
  const muted = theme.isDark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-lg border px-3 py-2 text-xs outline-none ${
    theme.isDark ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
  }`;

  const stageIndex = ticket ? MAINTENANCE_FUNNEL.indexOf(ticket.stage) : -1;
  const downtimeMs = ticket
    ? (ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : ticket.cancelledAt ? new Date(ticket.cancelledAt).getTime() : Date.now()) -
      new Date(ticket.openedAt).getTime()
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-rose-800 via-rose-700 to-amber-600 px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-100" />
            <h2 className="font-bold text-sm tracking-wide">
              {ticket ? `OS nº ${ticket.number} • Quarto ${ticket.roomNumber}` : "Ordem de serviço de manutenção"}
            </h2>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50" title="Fechar (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !ticket ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <div className="p-4 space-y-3 text-xs overflow-y-auto max-h-[80vh]">
            {/* Funil */}
            {ticket.stage === "CANCELLED" ? (
              <div className={`rounded-lg border px-3 py-2 font-semibold ${theme.isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-300 text-slate-700"}`}>
                OS cancelada por {ticket.cancelledByName} em {formatMaintenanceDateTime(ticket.cancelledAt, true)} — {ticket.cancelReason}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {MAINTENANCE_FUNNEL.map((s, i) => {
                  const done = i < stageIndex;
                  const current = i === stageIndex;
                  return (
                    <div
                      key={s}
                      className={`rounded-lg border px-2 py-2 text-center text-[10px] font-bold leading-tight ${
                        current
                          ? "bg-rose-700 border-rose-600 text-white"
                          : done
                            ? theme.isDark
                              ? "bg-emerald-900/40 border-emerald-800 text-emerald-300"
                              : "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : theme.isDark
                              ? "bg-slate-900 border-slate-800 text-slate-500"
                              : "bg-white border-slate-200 text-slate-400"
                      }`}
                    >
                      {i + 1}. {MAINTENANCE_STAGE_LABEL[s]}
                      {current && s === "WAITING" && ticket.waitReason ? (
                        <span className="block font-medium opacity-90 mt-0.5">{ticket.waitReason}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Problema */}
            <div className={card}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-rose-600 dark:text-rose-400">{ticket.problemType}</span>
                <span className={`flex items-center gap-1 font-mono ${muted}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {ticket.resolvedAt ? "Ficou inativo" : ticket.cancelledAt ? "Durou" : "Parado há"} {formatMaintenanceDuration(downtimeMs)}
                </span>
              </div>
              <p className="text-sm font-medium">{ticket.description}</p>
              <div className={`grid grid-cols-2 gap-2 pt-1 text-[11px] ${muted}`}>
                <div>
                  <span className="block text-[10px] font-semibold uppercase">Colaborador</span>
                  <span className={theme.isDark ? "text-white font-bold" : "text-slate-900 font-bold"}>{ticket.employeeName}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase">Entrada em manutenção</span>
                  <span className="font-mono">{formatMaintenanceDateTime(ticket.openedAt, true)}</span> — {ticket.openedByName}
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase">Previsão de liberação</span>
                  <span className="font-mono">{ticket.expectedReleaseAt ? formatMaintenanceDateTime(ticket.expectedReleaseAt, true) : "Não informada"}</span>
                </div>
                {ticket.resolvedAt && (
                  <div>
                    <span className="block text-[10px] font-semibold uppercase">Retorno do quarto</span>
                    <span className="font-mono">{formatMaintenanceDateTime(ticket.resolvedAt, true)}</span>
                  </div>
                )}
              </div>
              {ticket.resolutionNotes && (
                <div className="pt-1">
                  <span className={`block text-[10px] font-semibold uppercase ${muted}`}>O que foi feito</span>
                  <p className="whitespace-pre-wrap">{ticket.resolutionNotes}</p>
                </div>
              )}
            </div>

            {/* Aviso por WhatsApp */}
            {isOpenTicket && (
              <div
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 font-semibold ${
                  ticket.notifyStatus === "FAILED"
                    ? theme.isDark
                      ? "bg-red-950/40 border-red-800 text-red-300"
                      : "bg-red-50 border-red-300 text-red-700"
                    : theme.isDark
                      ? "bg-slate-900 border-slate-800 text-slate-300"
                      : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  {ticket.notifyStatus === "SENT"
                    ? `Aviso entregue pelo WhatsApp em ${formatMaintenanceDateTime(ticket.notifiedAt)}`
                    : ticket.notifyStatus === "FAILED"
                      ? "O aviso pelo WhatsApp não foi entregue."
                      : "Aviso pelo WhatsApp sendo enviado…"}
                </span>
                {ticket.notifyStatus === "FAILED" && (
                  <button
                    onClick={doResend}
                    disabled={busy}
                    className="px-3 py-1 rounded-lg bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reenviar aviso
                  </button>
                )}
              </div>
            )}

            {/* Fotos do problema (tiradas pelo colaborador no app) */}
            {ticket.photos.length > 0 && (
              <div className={card}>
                <span className={`block text-[10px] font-semibold uppercase ${muted}`}>Fotos ({ticket.photos.length})</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {ticket.photos.map((p) =>
                    p.url ? (
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" title={`${p.actorName} — ${formatMaintenanceDateTime(p.createdAt, true)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="Foto do problema" className="w-full aspect-square object-cover rounded-lg border border-slate-400/30" />
                      </a>
                    ) : (
                      <div key={p.id} className={`w-full aspect-square rounded-lg border flex items-center justify-center text-[10px] ${muted}`}>
                        indisponível
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Linha do tempo */}
            <div className={card}>
              <span className={`block text-[10px] font-semibold uppercase ${muted}`}>Linha do tempo</span>
              <ol className="space-y-2">
                {ticket.events.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="mt-1 w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold">
                        {e.type === "STAGE_CHANGED" && e.toStage ? `→ ${MAINTENANCE_STAGE_LABEL[e.toStage]}` : EVENT_LABEL[e.type]}
                        {e.waitReason ? ` (${e.waitReason})` : ""}
                      </div>
                      {e.note && <div className="whitespace-pre-wrap">{e.note}</div>}
                      <div className={`text-[10px] ${muted}`}>
                        {formatMaintenanceDateTime(e.createdAt, true)} — {e.actorName}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Ações do admin */}
            {isOpenTicket && isAdmin && mode === "reassign" && (
              <div className={card}>
                <span className={`block text-[10px] font-semibold uppercase ${muted}`}>Passar a OS para outro colaborador</span>
                {employees.length === 0 ? (
                  <p className={muted}>Não há outro colaborador de manutenção com WhatsApp cadastrado.</p>
                ) : (
                  <select value={newEmployeeId} onChange={(e) => setNewEmployeeId(e.target.value)} className={field}>
                    <option value="">Selecione…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setMode("view")} disabled={busy} className="px-3 py-1.5 rounded-lg border text-[11px] font-semibold border-slate-400/40">
                    Voltar
                  </button>
                  <button
                    onClick={doReassign}
                    disabled={busy || employees.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}

            {isOpenTicket && isAdmin && mode === "cancel" && (
              <div className={card}>
                <span className={`block text-[10px] font-semibold uppercase ${muted}`}>Cancelar a OS</span>
                <p className={muted}>Use só para OS aberta por engano. O quarto volta para a situação em que estava antes.</p>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Motivo do cancelamento"
                  className={`${field} resize-none`}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setMode("view")} disabled={busy} className="px-3 py-1.5 rounded-lg border text-[11px] font-semibold border-slate-400/40">
                    Voltar
                  </button>
                  <button
                    onClick={doCancel}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Cancelar OS
                  </button>
                </div>
              </div>
            )}

            {isOpenTicket && (
              <p className={`text-[10px] ${muted}`}>
                Só {ticket.employeeName} pode avançar as etapas desta OS, pelo app de manutenção dele.
              </p>
            )}
          </div>
        )}

        {ticket && isOpenTicket && isAdmin && mode === "view" && (
          <div className={`px-4 py-3 border-t flex flex-wrap items-center justify-end gap-2 ${theme.isDark ? "border-slate-800" : "border-slate-300"}`}>
            <button
              onClick={openReassign}
              disabled={busy}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                theme.isDark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <UserCog className="w-4 h-4" /> Passar para outro colaborador
            </button>
            <button
              onClick={() => setMode("cancel")}
              disabled={busy}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                theme.isDark ? "border-red-900 text-red-300 hover:bg-red-950/40" : "border-red-300 text-red-700 hover:bg-red-50"
              }`}
            >
              <Ban className="w-4 h-4" /> Cancelar OS
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
