"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Hourglass,
  Plus,
  RefreshCw,
  CheckCircle2,
  BellRing,
  Trash2,
  X,
  Bot,
  UserRound,
} from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { useTheme } from "@/context/ThemeContext";

interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestCpf: string | null;
  roomCategoryId: string;
  roomCategoryName: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  notes: string | null;
  status: "WAITING" | "NOTIFIED" | "CONVERTED" | "EXPIRED" | "CANCELLED";
  source: "MANUAL" | "AI_AGENT";
  operatorName: string | null;
  notifiedAt: string | null;
  convertedReservationId: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  kind: "LODGING" | "EVENT_SPACE";
}

function fmtDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

function timeInQueue(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / (60 * 1000)))}min`;
}

export default function WaitlistPanel({ onActiveCountChange }: { onActiveCountChange?: (n: number) => void }) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [vacancyIds, setVacancyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, vacRes] = await Promise.all([
        fetch("/api/waitlist").then((r) => r.json()),
        fetch("/api/waitlist/vacancies").then((r) => r.json()),
      ]);
      if (listRes.success) {
        setEntries(listRes.entries);
        onActiveCountChange?.(listRes.entries.length);
      }
      if (vacRes.success) setVacancyIds(new Set<string>(vacRes.entryIds));
    } catch {
      setFeedback({ type: "err", text: "Erro ao carregar a fila de espera." });
    } finally {
      setLoading(false);
    }
  }, [onActiveCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  const notify = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/waitlist/${id}/notify`, { method: "POST" });
      const data = await res.json();
      setFeedback(
        data.success
          ? { type: "ok", text: data.message || "Hóspede avisado." }
          : { type: "err", text: data.error || "Não foi possível avisar." },
      );
      if (data.success) load();
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (id: string) => {
    if (!confirm("Converter esta entrada da fila em uma reserva confirmada?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/waitlist/${id}/convert`, { method: "POST" });
      const data = await res.json();
      setFeedback(
        data.success
          ? { type: "ok", text: `Reserva ${data.reservationNumber} criada (quarto ${data.room}).` }
          : { type: "err", text: data.error || "Não foi possível converter." },
      );
      if (data.success) load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta entrada da fila de espera?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) load();
      else setFeedback({ type: "err", text: data.error || "Erro ao remover." });
    } finally {
      setBusyId(null);
    }
  };

  const card = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const heading = isDark ? "text-white" : "text-slate-900";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const faint = isDark ? "text-slate-500" : "text-slate-400";
  const theadCls = isDark
    ? "bg-[#1E293B]/60 text-slate-400 border-slate-800"
    : "bg-slate-100 text-slate-500 border-slate-200";
  const rowDivide = isDark ? "divide-slate-800/60" : "divide-slate-200";
  const rowHover = isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50";
  const cellStrong = isDark ? "text-slate-200" : "text-slate-700";
  const cellMed = isDark ? "text-slate-300" : "text-slate-600";
  const waitingBadge = isDark
    ? "bg-slate-700/40 text-slate-400 border-slate-600/30"
    : "bg-slate-100 text-slate-500 border-slate-300/60";

  return (
    <div className={`rounded-2xl border overflow-hidden ${card}`}>
      <div className={`p-4 border-b flex items-center justify-between flex-wrap gap-3 ${border}`}>
        <div className="flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-amber-400" />
          <h3 className={`text-sm font-semibold ${heading}`}>Fila de Espera</h3>
          <button
            onClick={load}
            className={`p-1 transition-colors ${muted} ${isDark ? "hover:text-white" : "hover:text-slate-900"}`}
            title="Atualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#0284C7]" : ""}`} />
          </button>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar à fila
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "ok"
              ? "bg-[#10B981]/15 text-[#10B981]"
              : "bg-[#EF4444]/15 text-[#EF4444]"
          }`}
        >
          {feedback.type === "ok" && <CheckCircle2 className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`text-xs font-mono border-b ${theadCls}`}>
              <th className="p-3.5">#</th>
              <th className="p-3.5">HÓSPEDE</th>
              <th className="p-3.5">CATEGORIA</th>
              <th className="p-3.5">PERÍODO</th>
              <th className="p-3.5">PESSOAS</th>
              <th className="p-3.5">NA FILA</th>
              <th className="p-3.5">SITUAÇÃO</th>
              <th className="p-3.5">AÇÕES</th>
            </tr>
          </thead>
          <tbody className={`divide-y text-xs ${rowDivide}`}>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className={`p-8 text-center ${faint}`}>
                  {loading ? "Carregando..." : "Nenhum hóspede na fila de espera."}
                </td>
              </tr>
            ) : (
              entries.map((e, idx) => {
                const hasVacancy = vacancyIds.has(e.id);
                return (
                  <tr key={e.id} className={`transition-colors ${rowHover}`}>
                    <td className={`p-3.5 font-mono ${faint}`}>{idx + 1}</td>
                    <td className="p-3.5">
                      <div className={`font-semibold flex items-center gap-1.5 ${heading}`}>
                        {e.source === "AI_AGENT" ? (
                          <Bot className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <UserRound className={`w-3.5 h-3.5 ${faint}`} />
                        )}
                        {e.guestName}
                      </div>
                      <span className={`text-[10px] ${muted}`}>{e.guestPhone || "sem telefone"}</span>
                      {e.notes && <span className={`block text-[10px] mt-0.5 ${faint}`}>{e.notes}</span>}
                    </td>
                    <td className={`p-3.5 ${cellStrong}`}>{e.roomCategoryName}</td>
                    <td className={`p-3.5 font-mono ${cellMed}`}>
                      {fmtDate(e.checkInDate)} a {fmtDate(e.checkOutDate)}
                    </td>
                    <td className={`p-3.5 ${cellMed}`}>
                      {e.adults}
                      {e.children > 0 ? ` + ${e.children}` : ""}
                    </td>
                    <td className={`p-3.5 ${muted}`}>{timeInQueue(e.createdAt)}</td>
                    <td className="p-3.5">
                      {e.status === "NOTIFIED" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[#38BDF8]/15 text-[#0284C7] border border-[#38BDF8]/30 flex items-center gap-1 w-fit">
                          <BellRing className="w-3 h-3" /> Avisado
                        </span>
                      ) : hasVacancy ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Vaga disponível
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] border w-fit block ${waitingBadge}`}>
                          Aguardando
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => notify(e.id)}
                          disabled={busyId === e.id || !e.guestPhone}
                          title={e.guestPhone ? "Avisar o hóspede pelo WhatsApp" : "Entrada sem telefone"}
                          className="px-2 py-1 bg-[#25D366]/15 hover:bg-[#25D366]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[#128C7E] border border-[#25D366]/30 rounded text-[11px] transition-colors flex items-center gap-1 font-medium"
                        >
                          <WhatsAppIcon className="w-3 h-3" /> Avisar
                        </button>
                        <button
                          onClick={() => convert(e.id)}
                          disabled={busyId === e.id}
                          title="Criar a reserva a partir desta entrada"
                          className="px-2 py-1 bg-[#0284C7]/15 hover:bg-[#0284C7]/30 disabled:opacity-40 text-[#0284C7] border border-[#0284C7]/30 rounded text-[11px] transition-colors font-medium"
                        >
                          Converter
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          disabled={busyId === e.id}
                          title="Remover da fila"
                          className={`p-1 transition-colors ${faint} hover:text-[#EF4444]`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddToWaitlistModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            setFeedback({ type: "ok", text: "Hóspede adicionado à fila de espera." });
            load();
          }}
        />
      )}
    </div>
  );
}

function AddToWaitlistModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    guestName: "",
    guestPhone: "",
    guestCpf: "",
    roomCategoryId: "",
    checkInDate: "",
    checkOutDate: "",
    adults: 1,
    children: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cadastros/categorias-apartamento")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategories((d.categories as Category[]).filter((c) => c.kind !== "EVENT_SPACE"));
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setError(null);
    if (!form.guestName.trim() || !form.roomCategoryId || !form.checkInDate || !form.checkOutDate) {
      setError("Preencha hóspede, categoria, chegada e saída.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) onSaved();
      else setError(data.error || "Erro ao adicionar à fila.");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const overlay = isDark ? "bg-slate-950/85 backdrop-blur-md" : "bg-slate-900/50 backdrop-blur-sm";
  const box = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const heading = isDark ? "text-white" : "text-slate-900";
  const label = isDark ? "text-slate-300" : "text-slate-600";
  const field = isDark
    ? "bg-[#1E293B] border-slate-700 text-white"
    : "bg-white border-slate-300 text-slate-900";
  const closeBtn = isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-700";
  const cancelBtn = isDark
    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
    : "bg-slate-100 hover:bg-slate-200 text-slate-600";
  const inputCls = `w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:border-[#0284C7] ${field}`;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlay}`}>
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${box}`}>
        <div className={`p-4 border-b flex items-center justify-between ${border}`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${heading}`}>
            <Hourglass className="w-4 h-4 text-amber-400" /> Adicionar à fila de espera
          </h3>
          <button onClick={onClose} className={closeBtn}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[#EF4444]/15 text-[#EF4444] text-xs font-semibold">{error}</div>
          )}

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Nome do hóspede *</label>
            <input
              value={form.guestName}
              onChange={(e) => set("guestName", e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Telefone (WhatsApp)</label>
              <input
                value={form.guestPhone}
                onChange={(e) => set("guestPhone", e.target.value)}
                placeholder="(00) 90000-0000"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>CPF</label>
              <input
                value={form.guestCpf}
                onChange={(e) => set("guestCpf", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Categoria desejada *</label>
            <select
              value={form.roomCategoryId}
              onChange={(e) => set("roomCategoryId", e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Chegada *</label>
              <input
                type="date"
                value={form.checkInDate}
                onChange={(e) => set("checkInDate", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Saída *</label>
              <input
                type="date"
                value={form.checkOutDate}
                onChange={(e) => set("checkOutDate", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Adultos</label>
              <input
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) => set("adults", Number(e.target.value) || 1)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Crianças</label>
              <input
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => set("children", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>

        <div className={`p-4 border-t flex justify-end gap-2 ${border}`}>
          <button
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${cancelBtn}`}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white text-xs font-bold"
          >
            {saving ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
