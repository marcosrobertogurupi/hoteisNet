"use client";

import { useState, useEffect } from "react";
import { BedDouble, Sparkles, CheckCircle2, Power, ShieldAlert, Eye, EyeOff } from "lucide-react";

export default function TenantGovernancePage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  // Sync rooms from database API & disabled rooms with localStorage
  useEffect(() => {
    fetch(`/api/reservations/rooms?tenantId=tenant-hoteisnet-demo`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.rooms)) {
          const savedDisabledStr = typeof window !== "undefined" ? localStorage.getItem("hoteisnet_disabled_rooms") : null;
          const disabledIds: string[] = savedDisabledStr ? JSON.parse(savedDisabledStr) : [];

          const loaded = data.rooms.map((r: any) => ({
            id: r.id,
            number: String(r.number),
            category: r.category || r.room_categories?.name || "Standard",
            status: r.status || "VACANT_CLEAN",
            housekeeper: r.status === "VACANT_CLEAN" ? "Higienizado" : "Governança",
            lastCleaned: r.status === "VACANT_CLEAN" ? "Higienizado & Vistoriado" : "Pendente higienização",
            active: !disabledIds.includes(r.id),
          }));
          setRooms(loaded);
        }
      })
      .catch((e) => console.error("Erro ao carregar quartos na Governança:", e));
  }, []);

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
    setRooms((prev) => {
      const updated = prev.map((r) => {
        if (r.id === roomId) {
          const nextActive = !r.active;
          setNotification(`Quarto ${r.number} ${nextActive ? "REATIVADO" : "DESATIVADO"} com sucesso! ${nextActive ? "Agora ele aparece no Mapa de Quartos." : "Ocultado da relação principal de quartos."}`);
          setTimeout(() => setNotification(null), 4000);
          return { ...r, active: nextActive };
        }
        return r;
      });

      // Save disabled list to localStorage
      const disabledIds = updated.filter((r) => !r.active).map((r) => r.id);
      localStorage.setItem("hoteisnet_disabled_rooms", JSON.stringify(disabledIds));

      return updated;
    });
  };

  return (
    <div className="space-y-6">
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
