"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Play, CheckCircle2, Clock, Sparkles, RefreshCw, Save } from "lucide-react";

interface RoomEntry {
  id: string;
  number: string;
  category: string | null;
  taskId: string | null;
  type: "CHECKOUT" | "OCCUPIED";
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  notes: string | null;
  startedAt: string | null;
  floor: string;
}

export default function HousekeepingRoomPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const [room, setRoom] = useState<RoomEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);

  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
        const found = data.floors
          .flatMap((f: any) => f.rooms.map((r: any) => ({ ...r, floor: f.floor })))
          .find((r: any) => r.id === roomId);
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
    // Atualização automática e transparente pelo banco — pega, por exemplo, um cancelamento feito
    // pela recepção sem precisar recarregar a página nem interromper o preenchimento da observação.
    const interval = setInterval(() => loadRoom(true), 4000);
    return () => clearInterval(interval);
  }, [loadRoom]);

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
        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${
          room.type === "OCCUPIED"
            ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
        }`}>
          {room.type === "OCCUPIED" ? "Arrumação com hóspede no quarto" : "Limpeza pós check-out"}
        </span>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-md mx-auto">
        {room.status === "PENDING" && (
          <div className="text-center space-y-5 py-8">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
              <Clock className="w-9 h-9 text-amber-400" />
            </div>
            <div>
              <p className="text-base font-bold">Quarto aguardando limpeza</p>
              <p className="text-xs text-slate-400 mt-1">Toque no botão abaixo para iniciar.</p>
            </div>
            {actionError && <p className="text-sm text-red-400 font-medium">{actionError}</p>}
            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" /> {starting ? "Iniciando..." : "Iniciar Limpeza"}
            </button>
          </div>
        )}

        {room.status === "IN_PROGRESS" && (
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
