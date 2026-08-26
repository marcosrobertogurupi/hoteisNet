"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Timer, X, User, MoveRight, DoorClosed } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface Housekeeper {
  id: string;
  name: string;
  photoUrl: string | null;
}

interface HousekeepingTask {
  id: string;
  roomId: string;
  type: "CHECKOUT" | "OCCUPIED";
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  housekeeper: Housekeeper | null;
}

interface RoomItem {
  id: string;
  number: string;
  category: string;
  floor: string;
  status: string;
  active: boolean;
}

// Ordena números de quarto/andar numericamente quando possível ("2" antes de "10").
function naturalCompare(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

export default function TenantGovernancePage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  const [assignmentMode, setAssignmentMode] = useState<"RECEPTION" | "QUEUE">("RECEPTION");
  const [housekeepers, setHousekeepers] = useState<Housekeeper[]>([]);
  const [tasksByRoom, setTasksByRoom] = useState<Record<string, HousekeepingTask>>({});
  // Quartos ocupados cuja arrumação de hoje a governanta marcou como "não perturbe" (modo QUEUE).
  const [dndRoomIds, setDndRoomIds] = useState<string[]>([]);
  const [assigningRoomId, setAssigningRoomId] = useState<string | null>(null);
  const [reopeningRoomId, setReopeningRoomId] = useState<string | null>(null);

  // Id do quarto/governanta que está recebendo o hover do arrasto no momento — usado só para
  // destacar visualmente o alvo válido durante o drag, não afeta os dados.
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const notify = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification((prev) => (prev?.text === text ? null : prev)), 4000);
  };

  const loadHousekeepingData = useCallback(() => {
    Promise.all([
      fetch("/api/tenant/housekeeping-settings").then((r) => r.json()),
      fetch("/api/tenant/housekeepers").then((r) => r.json()),
      fetch("/api/tenant/housekeeping-tasks").then((r) => r.json()),
    ])
      .then(([settingsData, housekeepersData, tasksData]) => {
        if (settingsData.success && settingsData.settings) {
          setAssignmentMode(settingsData.settings.assignmentMode === "QUEUE" ? "QUEUE" : "RECEPTION");
        }
        if (housekeepersData.success && Array.isArray(housekeepersData.housekeepers)) {
          setHousekeepers(housekeepersData.housekeepers.filter((h: any) => h.active));
        }
        if (tasksData.success && Array.isArray(tasksData.tasks)) {
          const map: Record<string, HousekeepingTask> = {};
          for (const t of tasksData.tasks) map[t.roomId] = t;
          setTasksByRoom((prev) => (JSON.stringify(prev) === JSON.stringify(map) ? prev : map));
        }
        if (tasksData.success && Array.isArray(tasksData.dndTodayRoomIds)) {
          setDndRoomIds((prev) =>
            JSON.stringify(prev) === JSON.stringify(tasksData.dndTodayRoomIds) ? prev : tasksData.dndTodayRoomIds
          );
        }
      })
      .catch((e) => console.error("Erro ao carregar dados de governança de limpeza:", e));
  }, []);

  // `silent` evita o overlay de carregamento nas atualizações automáticas em segundo plano.
  const loadRooms = useCallback((silent = false) => {
    if (!silent) setIsLoadingRooms(true);
    return fetch(`/api/reservations/rooms`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.rooms)) {
          const mapped = data.rooms.map((r: any) => ({
            id: r.id,
            number: String(r.number),
            category: r.category || r.room_categories?.name || "Standard",
            floor: r.floor || "Sem andar",
            status: r.status || "VACANT_CLEAN",
            active: r.active !== false,
          }));
          // Só troca a referência se o conteúdo mudou de verdade — evita re-render/piscar a cada
          // atualização automática sem novidade, e garante que a tela nunca fique com um status
          // de quarto desatualizado em relação ao banco (o que gerava erro ao tentar atribuir).
          setRooms((prev) => (JSON.stringify(prev) === JSON.stringify(mapped) ? prev : mapped));
        }
      })
      .catch((e) => console.error("Erro ao carregar quartos na Governança:", e))
      .finally(() => {
        if (!silent) setIsLoadingRooms(false);
      });
  }, []);

  useEffect(() => {
    loadRooms();
    loadHousekeepingData();
    // Atualização automática e transparente pelo banco a cada 4s, para a tela nunca ficar
    // desatualizada em relação a check-outs, check-ins ou atribuições feitas em outra tela/tablet.
    const interval = setInterval(() => {
      loadRooms(true);
      loadHousekeepingData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadRooms, loadHousekeepingData]);

  const handleAssign = async (roomId: string, housekeeperId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    const housekeeper = housekeepers.find((h) => h.id === housekeeperId);
    if (!room || !housekeeper) return;

    const type: "CHECKOUT" | "OCCUPIED" = room.status === "OCCUPIED" ? "OCCUPIED" : "CHECKOUT";

    setAssigningRoomId(roomId);
    try {
      const res = await fetch("/api/tenant/housekeeping-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, housekeeperId, type }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erro ao atribuir quarto.");
        return;
      }
      setTasksByRoom((prev) => ({ ...prev, [roomId]: data.task }));
      notify("success", `Quarto ${room.number} atribuído a ${housekeeper.name}!`);
    } catch (err: any) {
      notify("error", err.message || "Erro de rede ao atribuir quarto.");
    } finally {
      setAssigningRoomId(null);
      setDragOverId(null);
    }
  };

  const handleReopen = async (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    setReopeningRoomId(roomId);
    try {
      const res = await fetch("/api/tenant/housekeeping-tasks/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erro ao devolver o quarto à fila.");
        return;
      }
      setDndRoomIds((prev) => prev.filter((id) => id !== roomId));
      notify("success", `Arrumação do quarto ${room?.number ?? ""} devolvida à fila.`);
      loadHousekeepingData();
    } catch (err: any) {
      notify("error", err.message || "Erro de rede ao devolver o quarto à fila.");
    } finally {
      setReopeningRoomId(null);
    }
  };

  const handleCancelAssignment = async (roomId: string) => {
    const task = tasksByRoom[roomId];
    if (!task) return;

    try {
      const res = await fetch(`/api/tenant/housekeeping-tasks/${task.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("error", data.error || "Erro ao cancelar atribuição.");
        return;
      }
      setTasksByRoom((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    } catch (err: any) {
      notify("error", err.message || "Erro de rede ao cancelar atribuição.");
    }
  };

  // Só entram na tela quartos que realmente precisam de alguma ação de limpeza — livres/limpos e
  // em manutenção não aparecem, conforme pedido.
  const actionableRooms = rooms
    .filter((r) => r.active && (r.status === "VACANT_DIRTY" || r.status === "OCCUPIED"))
    .sort((a, b) => naturalCompare(a.floor, b.floor) || naturalCompare(a.number, b.number));

  const roomsByFloor = actionableRooms.reduce<{ floor: string; rooms: RoomItem[] }[]>((groups, room) => {
    const last = groups[groups.length - 1];
    if (last && last.floor === room.floor) {
      last.rooms.push(room);
    } else {
      groups.push({ floor: room.floor, rooms: [room] });
    }
    return groups;
  }, []);

  const canAssign = (room: RoomItem) => {
    const task = tasksByRoom[room.id];
    if (task) return false; // já tem tarefa (pendente ou em andamento) — não é alvo de novo drop
    if (room.status === "OCCUPIED") return true; // arrumação é sempre manual
    return assignmentMode === "RECEPTION"; // limpeza pós check-out só é manual nesse modo
  };

  const handleDropOnRoom = (e: React.DragEvent, room: RoomItem) => {
    e.preventDefault();
    setDragOverId(null);
    if (!canAssign(room)) return;
    const housekeeperId = e.dataTransfer.getData("housekeeperId");
    if (housekeeperId) handleAssign(room.id, housekeeperId);
  };

  const handleDropOnHousekeeper = (e: React.DragEvent, housekeeperId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const roomId = e.dataTransfer.getData("roomId");
    if (!roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    if (room && canAssign(room)) handleAssign(roomId, housekeeperId);
  };

  return (
    <div className="space-y-5">
      <LoadingOverlay show={isLoadingRooms} message="Buscando quartos..." submessage="Estamos carregando os dados mais recentes de governança." />

      <div className={`flex flex-wrap items-center justify-between gap-3 p-5 rounded-2xl border ${theme.bgCard}`}>
        <div>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${theme.textMain}`}>
            <Sparkles className="w-5 h-5 text-[#F59E0B]" />
            Atribuição de Limpeza
          </h2>
          <p className={`text-xs mt-1 flex items-center gap-1.5 ${theme.textMuted}`}>
            Arraste um quarto até uma governanta <MoveRight className="w-3 h-3" /> ou uma governanta até um quarto para atribuir.
          </p>
        </div>
        <span className={`text-xs font-mono px-3 py-1.5 rounded-lg border ${
          isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-700 border-slate-200"
        }`}>
          {actionableRooms.length} quarto{actionableRooms.length !== 1 ? "s" : ""} para tratar
        </span>
      </div>

      {notification && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold ${
          notification.type === "success"
            ? "bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]"
            : "bg-red-500/15 border-red-500/40 text-red-400"
        }`}>
          {notification.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
        {/* Quartos, separados por andar */}
        <div className="space-y-5">
          {roomsByFloor.map(({ floor, rooms: floorRooms }) => (
            <div key={floor} className="space-y-2.5">
              <h3 className={`text-xs font-mono uppercase tracking-wider px-1 ${theme.textMuted}`}>
                {floor} <span className="opacity-60">({floorRooms.length})</span>
              </h3>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {floorRooms.map((room) => {
            const task = tasksByRoom[room.id];
            const isOccupiedType = room.status === "OCCUPIED";
            const isDropTarget = canAssign(room);
            const isDragOver = dragOverId === room.id;

            return (
              <div
                key={room.id}
                draggable={isDropTarget}
                onDragStart={(e) => {
                  if (!isDropTarget) return;
                  e.dataTransfer.setData("roomId", room.id);
                }}
                onDragOver={(e) => {
                  if (!isDropTarget) return;
                  e.preventDefault();
                  setDragOverId(room.id);
                }}
                onDragLeave={() => setDragOverId((prev) => (prev === room.id ? null : prev))}
                onDrop={(e) => handleDropOnRoom(e, room)}
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  isDragOver
                    ? "border-emerald-400 bg-emerald-500/10 scale-[1.02]"
                    : task?.status === "IN_PROGRESS"
                    ? isOccupiedType
                      ? "border-violet-500/40 bg-violet-500/5"
                      : "border-[#F59E0B]/40 bg-[#F59E0B]/5"
                    : isDark
                    ? "border-slate-800 bg-slate-900/60"
                    : "border-slate-200 bg-white shadow-sm"
                } ${isDropTarget ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-xl border font-mono font-bold flex items-center justify-center text-sm shrink-0 ${
                      isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-100 border-slate-300 text-slate-900"
                    }`}>
                      {room.number}
                    </div>
                    <h4 className={`text-xs font-semibold leading-tight ${theme.textMain}`}>{room.category}</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                    isOccupiedType
                      ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                      : "bg-[#EAB308]/15 text-[#EAB308] border-[#EAB308]/30"
                  }`}>
                    {isOccupiedType ? "Ocupado" : "Pós check-out"}
                  </span>
                </div>

                {assignmentMode === "QUEUE" && !task && dndRoomIds.includes(room.id) && (
                  <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold ${
                    isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-100 text-amber-700"
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <DoorClosed className="w-3.5 h-3.5 shrink-0" /> Não perturbe hoje
                    </span>
                    <button
                      onClick={() => handleReopen(room.id)}
                      disabled={reopeningRoomId === room.id}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition shrink-0 disabled:opacity-60 ${
                        isDark ? "bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white" : "bg-white text-emerald-600 hover:bg-emerald-600 hover:text-white"
                      }`}
                    >
                      {reopeningRoomId === room.id ? "..." : "Devolver à fila"}
                    </button>
                  </div>
                )}

                {task?.status === "IN_PROGRESS" ? (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold animate-pulse ${
                    isOccupiedType ? "bg-violet-500/15 text-violet-400" : "bg-[#F59E0B]/15 text-[#F59E0B]"
                  }`}>
                    <Timer className="w-3.5 h-3.5 shrink-0" />
                    Em limpeza — {task.housekeeper?.name}
                  </div>
                ) : task?.status === "PENDING" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-1.5 text-[11px] ${theme.textMuted}`}>
                      {task.housekeeper?.photoUrl ? (
                        <img src={task.housekeeper.photoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[9px] font-bold">
                          {task.housekeeper?.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <strong className={`font-semibold ${theme.textMain}`}>{task.housekeeper?.name}</strong>
                    </span>
                    <button
                      onClick={() => handleCancelAssignment(room.id)}
                      title="Cancelar atribuição"
                      className={`p-1 rounded-lg transition shrink-0 ${
                        isDark ? "bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white" : "bg-slate-100 text-red-600 hover:bg-red-600 hover:text-white"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : isDropTarget ? (
                  <div className={`text-[11px] text-center py-1.5 rounded-lg border border-dashed transition ${
                    isDragOver ? "border-emerald-400 text-emerald-400" : isDark ? "border-slate-700 text-slate-500" : "border-slate-300 text-slate-500"
                  }`}>
                    Arraste uma governanta aqui
                  </div>
                ) : (
                  <div className={`text-[11px] text-center py-1.5 ${theme.textMuted}`}>
                    Aguardando fila automática
                  </div>
                )}
              </div>
                  );
                })}
              </div>
            </div>
          ))}

          {actionableRooms.length === 0 && !isLoadingRooms && (
            <div className={`text-center py-16 rounded-2xl border border-dashed text-sm ${
              isDark ? "border-slate-800 text-slate-500" : "border-slate-300 text-slate-500"
            }`}>
              Nenhum quarto precisa de atenção agora — tudo limpo ou ocupado sem pendência.
            </div>
          )}
        </div>

        {/* Governantas */}
        <div className={`lg:sticky lg:top-4 space-y-2.5 p-4 rounded-2xl border ${theme.bgCard}`}>
          <h3 className={`text-[10px] font-mono uppercase tracking-wider px-1 ${theme.textMuted}`}>Governantas</h3>
          {housekeepers.map((h) => {
            const isDragOver = dragOverId === h.id;
            return (
              <div
                key={h.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("housekeeperId", h.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(h.id);
                }}
                onDragLeave={() => setDragOverId((prev) => (prev === h.id ? null : prev))}
                onDrop={(e) => handleDropOnHousekeeper(e, h.id)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-grab active:cursor-grabbing transition ${
                  isDragOver
                    ? "border-emerald-400 bg-emerald-500/10 scale-[1.02]"
                    : isDark
                    ? "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
              >
                {h.photoUrl ? (
                  <img src={h.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs shrink-0">
                    {h.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className={`text-xs font-semibold truncate ${theme.textMain}`}>{h.name}</span>
              </div>
            );
          })}

          {housekeepers.length === 0 && (
            <div className={`flex flex-col items-center gap-2 py-6 text-center ${theme.textMuted}`}>
              <User className="w-6 h-6" />
              <p className="text-[11px]">Nenhuma governanta ativa cadastrada.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
