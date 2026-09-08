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

  return (
    <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Fila de Espera</h3>
          <button
            onClick={load}
            className="p-1 text-slate-400 hover:text-white transition-colors"
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

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
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
        <tbody className="divide-y divide-slate-800/60 text-xs">
          {entries.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-8 text-center text-slate-500">
                {loading ? "Carregando..." : "Nenhum hóspede na fila de espera."}
              </td>
            </tr>
          ) : (
            entries.map((e, idx) => {
              const hasVacancy = vacancyIds.has(e.id);
              return (
                <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-mono text-slate-500">{idx + 1}</td>
                  <td className="p-3.5">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      {e.source === "AI_AGENT" ? (
                        <Bot className="w-3.5 h-3.5 text-violet-400" />
                      ) : (
                        <UserRound className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {e.guestName}
                    </div>
                    <span className="text-[10px] text-slate-400">{e.guestPhone || "sem telefone"}</span>
                    {e.notes && <span className="block text-[10px] text-slate-500 mt-0.5">{e.notes}</span>}
                  </td>
                  <td className="p-3.5 text-slate-200">{e.roomCategoryName}</td>
                  <td className="p-3.5 font-mono text-slate-300">
                    {fmtDate(e.checkInDate)} a {fmtDate(e.checkOutDate)}
                  </td>
                  <td className="p-3.5 text-slate-300">
                    {e.adults}
                    {e.children > 0 ? ` + ${e.children}` : ""}
                  </td>
                  <td className="p-3.5 text-slate-400">{timeInQueue(e.createdAt)}</td>
                  <td className="p-3.5">
                    {e.status === "NOTIFIED" ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30 flex items-center gap-1 w-fit">
                        <BellRing className="w-3 h-3" /> Avisado
                      </span>
                    ) : hasVacancy ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Vaga disponível
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-700/40 text-slate-400 border border-slate-600/30 w-fit block">
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
                        className="px-2 py-1 bg-[#25D366]/15 hover:bg-[#25D366]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[#25D366] border border-[#25D366]/30 rounded text-[11px] transition-colors flex items-center gap-1 font-medium"
                      >
                        <WhatsAppIcon className="w-3 h-3" /> Avisar
                      </button>
                      <button
                        onClick={() => convert(e.id)}
                        disabled={busyId === e.id}
                        title="Criar a reserva a partir desta entrada"
                        className="px-2 py-1 bg-[#0284C7]/15 hover:bg-[#0284C7]/30 disabled:opacity-40 text-[#38BDF8] border border-[#0284C7]/30 rounded text-[11px] transition-colors font-medium"
                      >
                        Converter
                      </button>
                      <button
                        onClick={() => remove(e.id)}
                        disabled={busyId === e.id}
                        title="Remover da fila"
                        className="p-1 text-slate-500 hover:text-[#EF4444] transition-colors"
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#0F172A] border border-slate-800 shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-amber-400" /> Adicionar à fila de espera
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[#EF4444]/15 text-[#EF4444] text-xs font-semibold">{error}</div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Nome do hóspede *</label>
            <input
              value={form.guestName}
              onChange={(e) => set("guestName", e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Telefone (WhatsApp)</label>
              <input
                value={form.guestPhone}
                onChange={(e) => set("guestPhone", e.target.value)}
                placeholder="(00) 90000-0000"
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">CPF</label>
              <input
                value={form.guestCpf}
                onChange={(e) => set("guestCpf", e.target.value)}
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Categoria desejada *</label>
            <select
              value={form.roomCategoryId}
              onChange={(e) => set("roomCategoryId", e.target.value)}
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
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
              <label className="text-xs font-semibold text-slate-300">Chegada *</label>
              <input
                type="date"
                value={form.checkInDate}
                onChange={(e) => set("checkInDate", e.target.value)}
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Saída *</label>
              <input
                type="date"
                value={form.checkOutDate}
                onChange={(e) => set("checkOutDate", e.target.value)}
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Adultos</label>
              <input
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) => set("adults", Number(e.target.value) || 1)}
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Crianças</label>
              <input
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => set("children", Number(e.target.value) || 0)}
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
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
