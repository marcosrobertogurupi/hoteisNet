"use client";

import { useState, useEffect, useCallback } from "react";
import { FileCheck2, Send, Filter, RefreshCw, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";
import { useTheme } from "@/context/ThemeContext";

interface FnrhRow {
  id: string;
  guestName: string;
  roomNumber: string;
  reservationNumber: string | null;
  checkInDate: string;
  checkOutDate: string;
  transmittedSNRHos: boolean;
  transmittedAt: string | null;
  snrhosAttempts: number;
  friendlyError: string | null;
  deadline: string | null;
  deadlineHoursLeft: number | null;
  overdue: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ControleFnrhPage() {
  const { theme } = useTheme();

  const [statusFilter, setStatusFilter] = useState<"PENDING" | "SENT">("PENDING");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<FnrhRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/tenant/fnrh?${params.toString()}`);
      const data = await res.json();
      if (data.success) setRows(data.records || []);
    } catch (err) {
      console.error("Erro ao buscar fichas FNRH:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sendOne = async (id: string) => {
    setSendingId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/tenant/fnrh/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setFeedback({ type: "success", text: "Ficha enviada com sucesso ao SNRHos." });
      } else {
        setFeedback({ type: "error", text: data.error || "Falha ao enviar a ficha." });
        fetchData();
      }
    } finally {
      setSendingId(null);
    }
  };

  const sendAllListed = async () => {
    const pendingIds = rows.filter((r) => !r.transmittedSNRHos).map((r) => r.id);
    if (pendingIds.length === 0) return;

    setBatchProgress({ done: 0, total: pendingIds.length });
    setFeedback(null);
    let ok = 0;
    let fail = 0;

    for (const id of pendingIds) {
      try {
        const res = await fetch(`/api/tenant/fnrh/${id}/send`, { method: "POST" });
        const data = await res.json();
        if (data.success) ok++;
        else fail++;
      } catch {
        fail++;
      }
      setBatchProgress((p) => (p ? { done: p.done + 1, total: p.total } : null));
    }

    setBatchProgress(null);
    setFeedback({
      type: fail === 0 ? "success" : "error",
      text: `Envio em lote concluído: ${ok} enviada(s)${fail > 0 ? `, ${fail} com falha` : ""}.`,
    });
    fetchData();
  };

  const isBatchSending = batchProgress !== null;
  const pendingCount = rows.filter((r) => !r.transmittedSNRHos).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5" style={{ color: theme.primaryColor }} />
          <div>
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Controle de FNRH</h1>
            <p className={`text-xs ${theme.textMuted}`}>
              Acompanhe e envie manualmente as fichas de registro de hóspede pendentes de transmissão ao governo (SNRHos).
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 border ${theme.bgCard}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className={`inline-flex p-1 rounded-xl border ${theme.bgCard}`}>
        {(["PENDING", "SENT"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === s ? "text-white shadow-sm" : `${theme.textMuted} hover:opacity-80`
            }`}
            style={statusFilter === s ? { backgroundColor: theme.primaryColor } : undefined}
          >
            {s === "PENDING" ? "Não enviadas" : "Enviadas"}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-end gap-3 ${theme.bgCard}`}>
        <div className="w-44">
          <CustomDatePicker
            label={statusFilter === "SENT" ? "Enviadas de" : "Check-in de"}
            value={from}
            onChange={setFrom}
            isDark={theme.isDark}
            type="date"
          />
        </div>
        <div className="w-44">
          <CustomDatePicker
            label={statusFilter === "SENT" ? "Enviadas até" : "Check-in até"}
            value={to}
            onChange={setTo}
            isDark={theme.isDark}
            type="date"
          />
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Filtrando..." : "Filtrar"}
        </button>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold ${theme.textMuted} hover:opacity-80`}
          >
            Limpar período
          </button>
        )}

        {statusFilter === "PENDING" && pendingCount > 0 && (
          <button
            onClick={sendAllListed}
            disabled={isBatchSending}
            className="ml-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {isBatchSending ? `Enviando ${batchProgress!.done}/${batchProgress!.total}...` : `Enviar todas listadas (${pendingCount})`}
          </button>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-red-500/10 border-red-500/30 text-red-500"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {feedback.text}
        </div>
      )}

      {/* Table */}
      <div className={`rounded-2xl border overflow-x-auto ${theme.bgCard}`}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className={`border-b ${theme.borderColor}`}>
              <th className="p-3">Hóspede</th>
              <th className="p-3">Quarto</th>
              <th className="p-3">Reserva</th>
              <th className="p-3">Check-in</th>
              {statusFilter === "PENDING" ? (
                <>
                  <th className="p-3">Prazo legal</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3 text-right">Ação</th>
                </>
              ) : (
                <th className="p-3">Enviada em</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b ${theme.borderColor} last:border-0`}>
                <td className="p-3 font-medium">{r.guestName}</td>
                <td className="p-3">{r.roomNumber}</td>
                <td className="p-3">{r.reservationNumber || "-"}</td>
                <td className="p-3">{fmtDate(r.checkInDate)}</td>
                {statusFilter === "PENDING" ? (
                  <>
                    <td className="p-3">
                      <div
                        className={`flex items-center gap-1.5 font-semibold ${
                          r.overdue ? "text-red-500" : (r.deadlineHoursLeft ?? 999) <= 48 ? "text-amber-500" : theme.textMuted
                        }`}
                      >
                        <Clock3 className="w-3.5 h-3.5 shrink-0" />
                        {fmtDate(r.deadline)}
                        {r.overdue && <span>(vencido)</span>}
                        {!r.overdue && (r.deadlineHoursLeft ?? 999) <= 48 && <span>(vence em breve)</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      {r.friendlyError ? (
                        <span className="text-amber-500">
                          {r.friendlyError} {r.snrhosAttempts > 0 && `(${r.snrhosAttempts} tentativa${r.snrhosAttempts > 1 ? "s" : ""})`}
                        </span>
                      ) : (
                        <span className={theme.textMuted}>Aguardando envio</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => sendOne(r.id)}
                        disabled={sendingId === r.id || isBatchSending}
                        className="px-3 py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1.5 ml-auto disabled:opacity-60 transition-colors"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        <Send className="w-3 h-3" /> {sendingId === r.id ? "Enviando..." : "Enviar"}
                      </button>
                    </td>
                  </>
                ) : (
                  <td className="p-3">{fmtDateTime(r.transmittedAt)}</td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={statusFilter === "PENDING" ? 7 : 5} className={`p-6 text-center italic ${theme.textMuted}`}>
                  {loading ? "Carregando..." : statusFilter === "PENDING" ? "Nenhuma ficha pendente de envio." : "Nenhuma ficha enviada no período."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
