"use client";

import { useState, useEffect, useCallback } from "react";
import { BedDouble, Sparkles, CheckCircle2, Power, ShieldAlert, Eye, EyeOff, UserCheck, Timer, X } from "lucide-react";
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

export default function TenantGovernancePage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Governança de quartos — modo de atribuição (RECEPTION/QUEUE), lista de governantas ativas e
  // tarefas de limpeza em aberto (PENDING/IN_PROGRESS), usadas para montar a tela de atribuição
  // manual quando o assinante está no modo RECEPTION.
  const [assignmentMode, setAssignmentMode] = useState<"RECEPTION" | "QUEUE">("RECEPTION");
  const [housekeepers, setHousekeepers] = useState<Housekeeper[]>([]);
  const [tasksByRoom, setTasksByRoom] = useState<Record<string, HousekeepingTask>>({});
  const [selectedHousekeeper, setSelectedHousekeeper] = useState<Record<string, string>>({});
  const [assigningRoomId, setAssigningRoomId] = useState<string | null>(null);

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
          setTasksByRoom(map);
        }
      })
      .catch((e) => console.error("Erro ao carregar dados de governança de limpeza:", e));
  }, []);

  // Sync rooms from database API (o campo "active" já vem persistido no banco)
  useEffect(() => {
    fetch(`/api/reservations/rooms?tenantId=tenant-hoteisnet-demo`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.rooms)) {
          const loaded = data.rooms.map((r: any) => ({
            id: r.id,
            number: String(r.number),
            category: r.category || r.room_categories?.name || "Standard",
            status: r.status || "VACANT_CLEAN",
            housekeeper: r.status === "VACANT_CLEAN" ? "Higienizado" : "Governança",
            lastCleaned: r.status === "VACANT_CLEAN" ? "Higienizado & Vistoriado" : "Pendente higienização",
            active: r.active !== false,
          }));
          setRooms(loaded);
        }
      })
      .catch((e) => console.error("Erro ao carregar quartos na Governança:", e))
      .finally(() => setIsLoadingRooms(false));

    loadHousekeepingData();
  }, [loadHousekeepingData]);

  const handleAssignRoom = async (roomId: string, type: "CHECKOUT" | "OCCUPIED") => {
    const housekeeperId = selectedHousekeeper[roomId];
    if (!housekeeperId) return;

    setAssigningRoomId(roomId);
    try {
      const res = await fetch("/api/tenant/housekeeping-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, housekeeperId, type }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification(data.error || "Erro ao atribuir quarto.");
        setTimeout(() => setNotification(null), 4000);
        return;
      }
      setTasksByRoom((prev) => ({ ...prev, [roomId]: data.task }));
      setNotification(`Quarto atribuído a ${data.task.housekeeper?.name} com sucesso!`);
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification(err.message || "Erro de rede ao atribuir quarto.");
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setAssigningRoomId(null);
    }
  };

  const handleCancelAssignment = async (roomId: string) => {
    const task = tasksByRoom[roomId];
    if (!task) return;

    try {
      const res = await fetch(`/api/tenant/housekeeping-tasks/${task.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification(data.error || "Erro ao cancelar atribuição.");
        setTimeout(() => setNotification(null), 4000);
        return;
      }
      setTasksByRoom((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    } catch (err: any) {
      setNotification(err.message || "Erro de rede ao cancelar atribuição.");
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleUpdateStatus = (roomId: string, newStatus: string, statusLabel: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, status: newStatus, lastCleaned: `Atualizado às ${new Date().toLocaleTimeString().slice(0, 5)}` } : r))
    );

    setNotification(`Status do Quarto ${roomId} alterado com sucesso para "${statusLabel}"! Recepção notificada em tempo real.`);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleToggleRoomActive = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const nextActive = !room.active;

    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, active: nextActive } : r)));
    setNotification(`Quarto ${room.number} ${nextActive ? "REATIVADO" : "DESATIVADO"} com sucesso! ${nextActive ? "Agora ele aparece no Mapa de Quartos." : "Ocultado da relação principal de quartos."}`);
    setTimeout(() => setNotification(null), 4000);

    // Persistir no banco de dados
    fetch(`/api/reservations/rooms`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, active: nextActive }),
    }).catch((e) => console.error("Erro ao persistir status ativo do quarto:", e));
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoadingRooms} message="Buscando quartos..." submessage="Estamos carregando os dados mais recentes de governança." />

      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#F59E0B]" />
            Cadastro de Acomodações & Governança
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie o estado das acomodações (Vistoria, Higienização) e ative ou desative unidades para ocultá-las da recepção.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-medium text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Realtime Sync com Mapa de Quartos
          </span>
        </div>
      </div>

      {/* Realtime Notification */}
      {notification && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* Governance Cards List */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => {
          let borderStyle = "border-slate-800 bg-[#0F172A]";
          let badgeText = "Desconhecido";
          let badgeColor = "bg-slate-800 text-slate-400";

          if (!room.active) {
            borderStyle = "border-red-900/40 bg-red-950/10 opacity-75";
            badgeText = "DESATIVADO";
            badgeColor = "bg-red-500/20 text-red-400 border-red-500/30";
          } else if (room.status === "VACANT_CLEAN") {
            borderStyle = "border-[#10B981]/40 bg-[#10B981]/5";
            badgeText = "Livre / Higienizado";
            badgeColor = "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30";
          } else if (room.status === "OCCUPIED") {
            borderStyle = "border-[#0284C7]/40 bg-[#0284C7]/5";
            badgeText = "Ocupado";
            badgeColor = "bg-[#0284C7]/15 text-[#38BDF8] border-[#0284C7]/30";
          } else if (room.status === "OCCUPIED_CLEANING") {
            borderStyle = "border-[#F59E0B]/50 bg-[#F59E0B]/10";
            badgeText = "Limpeza c/ Hóspede";
            badgeColor = "bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40";
          } else if (room.status === "VACANT_DIRTY") {
            borderStyle = "border-[#EAB308]/50 bg-[#EAB308]/10";
            badgeText = "Pendente Limpeza";
            badgeColor = "bg-[#EAB308]/20 text-[#EAB308] border-[#EAB308]/40";
          } else if (room.status === "MAINTENANCE") {
            borderStyle = "border-slate-700 bg-slate-900/90";
            badgeText = "Manutenção";
            badgeColor = "bg-slate-800 text-slate-400 border-slate-700";
          }

          return (
            <div key={room.id} className={`p-5 rounded-2xl border ${borderStyle} space-y-4 shadow-sm`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0F172A] border border-slate-700 font-mono font-bold text-white flex items-center justify-center text-base">
                    {room.number}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{room.category}</h4>
                    <span className="text-[11px] text-slate-400 block">{room.lastCleaned}</span>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${badgeColor}`}>
                  {badgeText}
                </span>
              </div>

              {/* Sinal visual de limpeza em andamento — muda de cor/texto conforme o tipo */}
              {tasksByRoom[room.id]?.status === "IN_PROGRESS" && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold animate-pulse ${
                  tasksByRoom[room.id]?.type === "OCCUPIED"
                    ? "bg-violet-500/15 border border-violet-500/40 text-violet-400"
                    : "bg-[#F59E0B]/15 border border-[#F59E0B]/40 text-[#F59E0B]"
                }`}>
                  <Timer className="w-4 h-4" />
                  {tasksByRoom[room.id]?.type === "OCCUPIED" ? "Arrumação c/ hóspede" : "Limpeza pós check-out"} — {tasksByRoom[room.id]?.housekeeper?.name || "Governanta"}
                </div>
              )}

              {/* Atribuição manual de limpeza pós check-out (modo RECEPTION) */}
              {assignmentMode === "RECEPTION" && room.status === "VACANT_DIRTY" && room.active && (
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  {tasksByRoom[room.id]?.status === "PENDING" && tasksByRoom[room.id]?.type === "CHECKOUT" ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Atribuído a <strong className="text-white">{tasksByRoom[room.id]?.housekeeper?.name}</strong>
                      </span>
                      <button
                        onClick={() => handleCancelAssignment(room.id)}
                        title="Cancelar atribuição"
                        className="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedHousekeeper[room.id] || ""}
                        onChange={(e) => setSelectedHousekeeper((prev) => ({ ...prev, [room.id]: e.target.value }))}
                        className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Selecione a governanta...</option>
                        {housekeepers.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignRoom(room.id, "CHECKOUT")}
                        disabled={!selectedHousekeeper[room.id] || assigningRoomId === room.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-40"
                      >
                        Atribuir
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Arrumação com hóspede no quarto — sempre manual, independe do modo do assinante */}
              {room.status === "OCCUPIED" && room.active && (
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  {tasksByRoom[room.id]?.status === "PENDING" && tasksByRoom[room.id]?.type === "OCCUPIED" ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-violet-400" />
                        Arrumação atribuída a <strong className="text-white">{tasksByRoom[room.id]?.housekeeper?.name}</strong>
                      </span>
                      <button
                        onClick={() => handleCancelAssignment(room.id)}
                        title="Cancelar atribuição"
                        className="p-1.5 rounded-lg bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : !tasksByRoom[room.id] ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedHousekeeper[room.id] || ""}
                        onChange={(e) => setSelectedHousekeeper((prev) => ({ ...prev, [room.id]: e.target.value }))}
                        className="flex-1 bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500"
                      >
                        <option value="">Arrumar quarto com hóspede...</option>
                        {housekeepers.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignRoom(room.id, "OCCUPIED")}
                        disabled={!selectedHousekeeper[room.id] || assigningRoomId === room.id}
                        className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition disabled:opacity-40"
                      >
                        Atribuir
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Action Buttons for Housekeepers & Room Deactivation */}
              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => handleUpdateStatus(room.id, "VACANT_CLEAN", "Livre / Higienizado")}
                  disabled={!room.active}
                  className="flex-1 py-1.5 bg-[#10B981]/20 hover:bg-[#10B981]/30 text-[#10B981] border border-[#10B981]/30 rounded-lg transition-colors font-medium text-center disabled:opacity-40"
                >
                  ✓ Concluir Limpeza
                </button>

                <button
                  onClick={() => handleToggleRoomActive(room.id)}
                  title={room.active ? "Desativar quarto (Ocultar da relação)" : "Reativar quarto no sistema"}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    room.active
                      ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-red-950/60 hover:text-red-300 hover:border-red-800"
                      : "bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900"
                  }`}
                >
                  {room.active ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" /> Desativar
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" /> Ativar
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
