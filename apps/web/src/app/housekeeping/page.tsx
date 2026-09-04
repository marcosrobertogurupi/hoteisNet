"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/usePolling";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";
import PwaInstallButton from "@/components/PwaInstallButton";
import {
  Sparkles,
  Phone,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  ChevronRight,
  MessageSquare,
  BedDouble,
  CalendarClock,
} from "lucide-react";

interface HousekeeperInfo {
  id: string;
  name: string;
  whatsapp: string;
  photoUrl: string | null;
}

interface RoomEntry {
  id: string;
  number: string;
  category: string | null;
  roomStatus: "VACANT_CLEAN" | "VACANT_DIRTY" | "OCCUPIED" | "MAINTENANCE";
  taskId: string | null;
  type: "CHECKOUT" | "OCCUPIED";
  status: "PENDING" | "IN_PROGRESS";
  notes: string | null;
  startedAt: string | null;
  priority?: boolean;
}

interface FloorGroup {
  floor: string;
  pending: RoomEntry[];
}

export default function HousekeepingAppPage() {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, "rose");

  const [authChecked, setAuthChecked] = useState(false);
  const [housekeeper, setHousekeeper] = useState<HousekeeperInfo | null>(null);

  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [assignmentMode, setAssignmentMode] = useState<"RECEPTION" | "QUEUE">("RECEPTION");
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/housekeeping/me");
      const data = await res.json();
      if (data.success && data.housekeeper) {
        setHousekeeper(data.housekeeper);
      } else {
        setHousekeeper(null);
      }
      if (data?.theme) setTheme(data.theme, false); // tema do hotel, sem tentar gravar (não é admin)
    } catch {
      setHousekeeper(null);
    } finally {
      setAuthChecked(true);
    }
  }, [setTheme]);

  // `silent` evita o spinner do botão "Atualizar" nas atualizações automáticas em segundo plano —
  // só o clique manual mostra o indicador de carregando.
  const loadRooms = useCallback(async (silent = false) => {
    if (!silent) setLoadingRooms(true);
    try {
      const res = await fetch("/api/housekeeping/rooms");
      const data = await res.json();
      if (data.success) {
        setAssignmentMode(data.assignmentMode || "RECEPTION");
        // Só troca a referência do array se o conteúdo realmente mudou, para não re-renderizar
        // (e não "piscar" a tela) a cada atualização automática sem novidade real.
        setFloors((prev) => (JSON.stringify(prev) === JSON.stringify(data.floors || []) ? prev : data.floors || []));
      }
    } catch {
      // silencioso — próxima atualização automática tenta de novo
    } finally {
      if (!silent) setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (housekeeper) loadRooms();
  }, [housekeeper, loadRooms]);

  // Atualização automática e transparente pelo banco enquanto a governanta olha a lista — a cada
  // 10 s (antes 4 s), sem recarregar a tela. Pausa quando não há governanta logada e quando a aba
  // está em segundo plano (usePolling).
  usePolling(() => loadRooms(true), 10000, { paused: !housekeeper, runOnMount: false });

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!whatsapp.trim() || !password.trim()) {
      setLoginError("Informe WhatsApp e senha.");
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch("/api/housekeeping/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: whatsapp.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || "Erro ao entrar.");
        return;
      }
      setHousekeeper(data.housekeeper);
      if (data.theme) setTheme(data.theme, false);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message || "Erro de rede ao entrar.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/housekeeping/logout", { method: "POST" });
    } catch {
      // segue mesmo se a chamada falhar — limpa o estado local de qualquer forma
    }
    setHousekeeper(null);
    setFloors([]);
  };

  const getStatusBadge = (room: RoomEntry) => {
    if (room.status === "IN_PROGRESS") {
      return {
        text: "Em limpeza",
        className: `bg-sky-500/15 border-sky-500/30 animate-pulse ${theme.isDark ? "text-sky-300" : "text-sky-700"}`,
      };
    }
    return { text: "A limpar", className: `bg-amber-500/15 border-amber-500/30 ${theme.isDark ? "text-amber-300" : "text-amber-700"}` };
  };

  const getTypeLabel = (type: "CHECKOUT" | "OCCUPIED") =>
    type === "OCCUPIED" ? "Arrumação c/ hóspede" : "Limpeza pós check-out";

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-rose-500 animate-spin" />
      </div>
    );
  }

  if (!housekeeper) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 mx-auto">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className={`text-xl font-bold ${theme.textMain}`}>Governança de Quartos</h1>
            <p className={`text-sm ${theme.textMuted}`}>Entre com seu WhatsApp e senha para ver seus quartos.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>WhatsApp</label>
              <div className="relative">
                <Phone className={`w-4 h-4 absolute left-3.5 top-3.5 ${ui.faint}`} />
                <input
                  type="text"
                  inputMode="numeric"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(63) 99999-9999"
                  className={`w-full border rounded-2xl pl-11 pr-4 py-3.5 text-base focus:outline-none focus:border-rose-500 ${ui.field}`}
                />
              </div>
            </div>

            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>Senha</label>
              <div className="relative">
                <Lock className={`w-4 h-4 absolute left-3.5 top-3.5 ${ui.faint}`} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full border rounded-2xl pl-11 pr-11 py-3.5 text-base focus:outline-none focus:border-rose-500 ${ui.field}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-3.5 ${ui.faint}`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && <p className="text-sm text-rose-500 font-medium">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-base shadow-lg shadow-rose-600/20 transition disabled:opacity-60"
            >
              {loggingIn ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <PwaInstallButton accent="rose" />
        </div>
      </div>
    );
  }

  const totalPending = floors.reduce((sum, f) => sum + f.pending.length, 0);
  const hasAnything = totalPending > 0;

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className={`sticky top-0 z-10 backdrop-blur border-b px-4 py-4 flex items-center justify-between ${ui.bar}`}>
        <div className="flex items-center gap-3">
          {housekeeper.photoUrl ? (
            <img src={housekeeper.photoUrl} alt="" className={`w-10 h-10 rounded-full object-cover border ${ui.divider}`} />
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 font-bold">
              {housekeeper.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className={`text-sm font-bold leading-tight ${theme.textMain}`}>{housekeeper.name}</p>
            <p className={`text-[11px] ${theme.textMuted}`}>
              {assignmentMode === "RECEPTION" ? "Quartos atribuídos a você" : "Fila geral de limpeza"}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className={`p-2.5 rounded-xl border transition hover:opacity-80 ${ui.iconBtn}`}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-6">
        <PwaInstallButton accent="rose" />

        <div className="flex items-center justify-between">
          <span className={`text-xs font-mono ${theme.textMuted}`}>
            {totalPending} quarto{totalPending !== 1 ? "s" : ""} a limpar
          </span>
          <button
            onClick={() => loadRooms()}
            disabled={loadingRooms}
            className={`flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition ${ui.accentText}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {!hasAnything && !loadingRooms && (
          <div className="text-center py-16 space-y-3">
            <Sparkles className={`w-10 h-10 mx-auto ${ui.faint}`} />
            <p className={`text-sm font-medium ${theme.textMain}`}>Nenhum quarto pendente no momento</p>
            <p className={`text-xs ${ui.faint}`}>
              {assignmentMode === "RECEPTION"
                ? "Assim que a recepção atribuir um quarto a você, ele aparece aqui."
                : "Assim que houver um quarto para limpar, ele aparece aqui."}
            </p>
          </div>
        )}

        {floors.map((floor) => {
          if (floor.pending.length === 0) return null;
          return (
            <div key={floor.floor} className="space-y-2.5">
              <h2 className={`text-xs font-mono uppercase tracking-wider px-1 ${ui.faint}`}>{floor.floor}</h2>

              <div className="space-y-2.5">
                {floor.pending.map((room) => {
                  const badge = getStatusBadge(room);
                  const isOccupied = room.type === "OCCUPIED";
                  return (
                    <button
                      key={room.id}
                      onClick={() => router.push(`/housekeeping/room/${room.id}`)}
                      className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border transition text-left ${ui.card} ${
                        room.priority
                          ? "border-rose-500/60 ring-1 ring-rose-500/30 hover:border-rose-400"
                          : "hover:border-rose-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center font-mono font-bold text-base ${ui.chip}`}>
                          {room.number}
                        </div>
                        <div>
                          {room.priority && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 mb-1 rounded-full text-[10px] font-bold border bg-rose-500/15 border-rose-500/40 ${
                                theme.isDark ? "text-rose-300" : "text-rose-700"
                              }`}
                            >
                              <CalendarClock className="w-3 h-3" /> Prioridade — reserva chega hoje
                            </span>
                          )}
                          <p className={`text-sm font-bold ${theme.textMain}`}>{room.category || "Quarto"}</p>
                          <p
                            className={`text-[11px] flex items-center gap-1 ${
                              isOccupied ? (theme.isDark ? "text-violet-300" : "text-violet-600") : ui.faint
                            }`}
                          >
                            {isOccupied && <BedDouble className="w-3 h-3" />}
                            {getTypeLabel(room.type)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                              {badge.text}
                            </span>
                            {room.notes && <MessageSquare className={`w-3 h-3 ${ui.faint}`} />}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${ui.faint}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
