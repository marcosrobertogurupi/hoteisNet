"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Phone, Lock, Eye, EyeOff, LogOut, RefreshCw, ChevronRight, MessageSquare } from "lucide-react";

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
  taskId: string | null;
  type: "CHECKOUT" | "OCCUPIED";
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  notes: string | null;
  startedAt: string | null;
}

interface FloorGroup {
  floor: string;
  rooms: RoomEntry[];
}

export default function HousekeepingAppPage() {
  const router = useRouter();

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
    } catch {
      setHousekeeper(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

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
    if (!housekeeper) return;
    loadRooms();
    // Atualização automática e transparente pelo banco, a cada 4s, enquanto a governanta está
    // olhando a lista de quartos — sem recarregar a tela nem mostrar indicador de carregamento.
    const interval = setInterval(() => loadRooms(true), 4000);
    return () => clearInterval(interval);
  }, [housekeeper, loadRooms]);

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
      return { text: "Em limpeza", className: "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse" };
    }
    return { text: "A limpar", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
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
            <h1 className="text-xl font-bold">Governança de Quartos</h1>
            <p className="text-sm text-slate-400">Entre com seu WhatsApp e senha para ver seus quartos.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-300">WhatsApp</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(63) 99999-9999"
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-base focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-300">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-11 py-3.5 text-base focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && <p className="text-sm text-red-400 font-medium">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-base shadow-lg shadow-rose-600/20 transition disabled:opacity-60"
            >
              {loggingIn ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const totalRooms = floors.reduce((sum, f) => sum + f.rooms.length, 0);

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#090D16]/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {housekeeper.photoUrl ? (
            <img src={housekeeper.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-500 font-bold">
              {housekeeper.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-bold leading-tight">{housekeeper.name}</p>
            <p className="text-[11px] text-slate-400">
              {assignmentMode === "RECEPTION" ? "Quartos atribuídos a você" : "Fila geral de limpeza"}
            </p>
          </div>
        </div>
        <button onClick={handleLogout} title="Sair" className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-slate-400">
            {totalRooms} quarto{totalRooms !== 1 ? "s" : ""} pendente{totalRooms !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => loadRooms()}
            disabled={loadingRooms}
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {floors.length === 0 && !loadingRooms && (
          <div className="text-center py-16 space-y-3">
            <Sparkles className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-300">Nenhum quarto pendente no momento</p>
            <p className="text-xs text-slate-500">
              {assignmentMode === "RECEPTION"
                ? "Assim que a recepção atribuir um quarto a você, ele aparece aqui."
                : "Assim que houver um quarto sujo, ele aparece aqui."}
            </p>
          </div>
        )}

        {floors.map((floor) => (
          <div key={floor.floor} className="space-y-2.5">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 px-1">{floor.floor}</h2>
            <div className="space-y-2.5">
              {floor.rooms.map((room) => {
                const badge = getStatusBadge(room);
                return (
                  <button
                    key={room.id}
                    onClick={() => router.push(`/housekeeping/room/${room.id}`)}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-rose-500/40 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center font-mono font-bold text-base">
                        {room.number}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{room.category || "Quarto"}</p>
                        <p className="text-[11px] text-slate-500">{getTypeLabel(room.type)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.className}`}>
                            {badge.text}
                          </span>
                          {room.notes && (
                            <MessageSquare className="w-3 h-3 text-slate-500" />
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
