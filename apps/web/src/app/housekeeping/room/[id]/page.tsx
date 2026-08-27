"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { usePolling } from "@/lib/usePolling";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  SprayCan,
  Sparkles,
  RefreshCw,
  Save,
  BedDouble,
  DoorClosed,
} from "lucide-react";

interface RoomView {
  id: string;
  number: string;
  category: string | null;
  floor: string;
  // "pending" ou "resolved" — de qual bloco da listagem o quarto veio.
  section: "pending" | "resolved";
  // Campos de pendente:
  roomStatus?: "VACANT_CLEAN" | "VACANT_DIRTY" | "OCCUPIED" | "MAINTENANCE";
  taskId?: string | null;
  type?: "CHECKOUT" | "OCCUPIED";
  status?: "PENDING" | "IN_PROGRESS";
  notes?: string | null;
  startedAt?: string | null;
  // Campos de resolvido:
  outcome?: "CLEANED" | "DND";
  resolvedAt?: string | null;
  resolvedByName?: string | null;
}

function formatTimeBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HousekeepingRoomPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);

  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // "Não perturbe": painel de confirmação inline + observação opcional.
  const [dndOpen, setDndOpen] = useState(false);
  const [dndNote, setDndNote] = useState("");
  const [dndSubmitting, setDndSubmitting] = useState(false);

  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Garante que a observação só é preenchida a partir do servidor uma vez, no carregamento
  // inicial — atualizações automáticas em segundo plano nunca sobrescrevem o que a governanta
  // está digitando no campo de observação.
  const notesInitializedRef = useRef(false);

  const loadRoom = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch("/api/housekeeping/rooms");
        const data = await res.json();
        if (!data.success) {
          if (!silent) setNotFound(true);
          return;
        }
        let found: RoomView | null = null;
        for (const f of data.floors || []) {
          const p = (f.pending || []).find((r: any) => r.id === roomId);
          if (p) {
            found = { ...p, floor: f.floor, section: "pending" };
            break;
          }
          const r = (f.resolvedToday || []).find((x: any) => x.id === roomId);
          if (r) {
            found = { ...r, floor: f.floor, section: "resolved" };
            break;
          }
        }
        if (!found) {
          setNotFound(true);
          return;
        }
        setRoom(found);
        if (!notesInitializedRef.current) {
          setNotes(found.notes || "");
          notesInitializedRef.current = true;
        }
      } catch {
        if (!silent) setNotFound(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [roomId]
  );

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // Atualização automática e transparente pelo banco a cada 10 s (antes 4 s) — pega, por exemplo,
  // um cancelamento feito pela recepção sem recarregar a página nem interromper a digitação da
  // observação. Pausa com a aba em segundo plano (usePolling).
  usePolling(() => loadRoom(true), 10000, { runOnMount: false });

  const handleStart = async () => {
    setActionError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/housekeeping/rooms/${roomId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Erro ao iniciar limpeza.");
        return;
      }
      await loadRoom();
    } catch (err: any) {
      setActionError(err.message || "Erro de rede ao iniciar limpeza.");
    } finally {
      setStarting(false);
    }
  };

  const handleConfirmDnd = async () => {
    setActionError(null);
    setDndSubmitting(true);
    try {
      const res = await fetch(`/api/housekeeping/rooms/${roomId}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: dndNote.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Erro ao registrar \"não perturbe\".");
        return;
      }
      router.push("/housekeeping");
    } catch (err: any) {
      setActionError(err.message || "Erro de rede ao registrar \"não perturbe\".");
    } finally {
      setDndSubmitting(false);
    }
  };

  const saveNotes = useCallback(
    async (value: string) => {
      if (!room?.taskId) return;
      setSavingNotes(true);
      try {
        await fetch(`/api/housekeeping/tasks/${room.taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        setNotesSaved(true);
      } catch {
        // silencioso — próxima edição tenta salvar de novo
      } finally {
        setSavingNotes(false);
      }
    },
    [room?.taskId]
  );

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => saveNotes(value), 800);
  };

  const handleFinish = async () => {
    if (!room?.taskId) return;
    setActionError(null);
    setFinishing(true);
    try {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
      const res = await fetch(`/api/housekeeping/tasks/${room.taskId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionError(data.error || "Erro ao concluir limpeza.");
        return;
      }
      router.push("/housekeeping");
    } catch (err: any) {
      setActionError(err.message || "Erro de rede ao concluir limpeza.");
    } finally {
      setFinishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (notFound || !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-sm text-slate-400">Quarto não encontrado ou não está mais atribuído a você.</p>
        <button
          onClick={() => router.push("/housekeeping")}
          className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
        >
          Voltar para a lista
        </button>
      </div>
    );
  }

  const isOccupied = room.type === "OCCUPIED" || room.roomStatus === "OCCUPIED";

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-10 bg-[#090D16]/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/housekeeping")} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-sm font-bold">Quarto {room.number}</p>
          <p className="text-[11px] text-slate-400">{room.floor} • {room.category || "Quarto"}</p>
        </div>
      </div>

      <div className="px-4 pt-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
          isOccupied
            ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
        }`}>
          {isOccupied ? <BedDouble className="w-3 h-3" /> : null}
          {isOccupied ? "Arrumação com hóspede no quarto" : "Limpeza pós check-out"}
        </span>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-md mx-auto">
        {room.section === "resolved" && (
          <div className="text-center space-y-4 py-10">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border ${
              room.outcome === "DND"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            }`}>
              {room.outcome === "DND" ? <DoorClosed className="w-9 h-9" /> : <CheckCircle2 className="w-9 h-9" />}
            </div>
            <div>
              <p className="text-base font-bold">
                {room.outcome === "DND" ? "Registrado em \"não perturbe\"" : "Arrumação concluída"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatTimeBR(room.resolvedAt)}
                {room.resolvedByName ? ` · ${room.resolvedByName}` : ""}
              </p>
            </div>
            {room.notes && (
              <p className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                {room.notes}
              </p>
            )}
            <button
              onClick={() => router.push("/housekeeping")}
              className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm transition"
            >
              Voltar para a lista
            </button>
          </div>
        )}

        {room.section === "pending" && room.status === "PENDING" && (
          <div className="space-y-5 py-6">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
                <SprayCan className="w-9 h-9 text-amber-400" />
              </div>
              <div>
                <p className="text-base font-bold">Quarto aguardando limpeza</p>
                <p className="text-xs text-slate-400 mt-1">Toque em iniciar quando começar.</p>
              </div>
            </div>

            {actionError && <p className="text-sm text-red-400 font-medium text-center">{actionError}</p>}

            <button
              onClick={handleStart}
              disabled={starting || dndSubmitting}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" /> {starting ? "Iniciando..." : "Iniciar Limpeza"}
            </button>

            {isOccupied && !dndOpen && (
              <button
                onClick={() => setDndOpen(true)}
                disabled={starting}
                className="w-full py-3 rounded-2xl bg-slate-900 border border-slate-700 text-slate-300 hover:border-amber-500/50 hover:text-amber-300 font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <DoorClosed className="w-4 h-4" /> Hóspede em Não Perturbe
              </button>
            )}

            {isOccupied && dndOpen && (
              <div className="space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/25">
                <p className="text-xs font-semibold text-amber-200">
                  Confirmar que o quarto {room.number} está em "não perturbe"? Isso encerra a arrumação de hoje deste quarto.
                </p>
                <textarea
                  value={dndNote}
                  onChange={(e) => setDndNote(e.target.value)}
                  placeholder='Observação (opcional) — ex: "hóspede pediu para arrumar só amanhã"'
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setDndOpen(false);
                      setDndNote("");
                    }}
                    disabled={dndSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm transition disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmDnd}
                    disabled={dndSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition disabled:opacity-60"
                  >
                    {dndSubmitting ? "Registrando..." : "Confirmar não perturbe"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {room.section === "pending" && room.status === "IN_PROGRESS" && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-2 py-2">
              <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
              <p className="text-sm font-bold text-sky-400">Limpeza em andamento</p>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-2 text-slate-300">
                Observação (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder='Ex: "Hóspede fumou no quarto" ou "Faltando uma toalha"'
                rows={4}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-rose-500 resize-none"
              />
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                {savingNotes ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" /> Salvando...
                  </>
                ) : notesSaved ? (
                  <>
                    <Save className="w-3 h-3" /> Observação salva
                  </>
                ) : (
                  "Alterações não salvas..."
                )}
              </p>
            </div>

            {actionError && <p className="text-sm text-red-400 font-medium">{actionError}</p>}

            <button
              onClick={handleFinish}
              disabled={finishing}
              className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-base shadow-lg shadow-rose-600/20 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> {finishing ? "Concluindo..." : "Quarto Limpo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
