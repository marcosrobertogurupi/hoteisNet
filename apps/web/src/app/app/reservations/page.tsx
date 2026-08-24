"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarDays, Plus, Layers, Search, Building2, CheckCircle2, Clock, LayoutGrid, List, RefreshCw } from "lucide-react";
import ReservationGridMap from "@/components/ReservationGridMap";
import LancarReservaModal from "@/components/LancarReservaModal";
import ReservasMultiplasModal from "@/components/ReservasMultiplasModal";
import { useTheme } from "@/context/ThemeContext";
import { isReservationExpired } from "@/utils/reservationTolerance";
import LoadingOverlay from "@/components/LoadingOverlay";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";

export default function TenantReservationsPage() {
  const { defaultCheckInTime, reservationToleranceHours } = useTheme();
  const [activeTab, setActiveTab] = useState<"GRID" | "LIST">("GRID");
  const [showLancarModal, setShowLancarModal] = useState(false);
  const [showMultiplasModal, setShowMultiplasModal] = useState(false);
  const [uazapiSentSuccess, setUazapiSentSuccess] = useState<string | null>(null);
  const [uazapiSentError, setUazapiSentError] = useState<string | null>(null);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingReservations, setIsLoadingReservations] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [reservations, setReservations] = useState<any[]>([]);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reservations?tenantId=TNT-01");
      const data = await res.json();
      if (data.success && Array.isArray(data.reservations)) {
        setReservations(data.reservations);
      }
    } catch (err) {
      console.error("Erro ao buscar reservas:", err);
    } finally {
      setLoading(false);
      setIsLoadingReservations(false);
    }
  }, []);

  // Polling em segundo plano a cada 3 segundos, igual ao Mapa de Quartos — pausado enquanto o
  // modal "Lançar Nova Reserva" estiver aberto, para não sobrescrever dados que o operador esteja
  // digitando (padrão herdado do projeto original em WinDev: telas de mapa atualizam sozinhas,
  // janelas abertas por cima pausam a atualização).
  useEffect(() => {
    if (showLancarModal || showMultiplasModal) return;
    fetchReservations();
    const interval = setInterval(fetchReservations, 3000);
    return () => clearInterval(interval);
  }, [fetchReservations, showLancarModal, showMultiplasModal]);

  const handleSendUazapiLink = async (resId: string) => {
    setSendingLinkId(resId);
    setUazapiSentError(null);
    try {
      const res = await fetch("/api/uazapi/send-precheckin-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: resId }),
      });
      const data = await res.json();

      if (data.success) {
        setUazapiSentSuccess("Link de pré-check-in FNRH enviado com sucesso via WhatsApp!");
        setReservations((prev) => prev.map((r) => (r.id === resId ? { ...r, preCheckinSent: true } : r)));
        setTimeout(() => setUazapiSentSuccess(null), 4000);
      } else {
        setUazapiSentError(data.error || "Não foi possível enviar o link de pré-check-in.");
        setTimeout(() => setUazapiSentError(null), 6000);
      }
    } catch (err) {
      setUazapiSentError("Erro de conexão ao enviar o link de pré-check-in.");
      setTimeout(() => setUazapiSentError(null), 6000);
    } finally {
      setSendingLinkId(null);
    }
  };

  const now = new Date();

  const filteredReservations = reservations
    ? reservations.filter((r) => {
        // Ocultar reservas expiradas (no-show) por regra de tolerância do assinante
        if (
          isReservationExpired({
            checkInDate: (r.checkInDate || r.check_in_date || "").split("T")[0],
            checkInTime: r.checkInTime || null,
            defaultCheckInTime: defaultCheckInTime || "14:00",
            toleranceHours: reservationToleranceHours,
            status: r.status,
          }, now)
        ) return false;

        const q = searchQuery.toLowerCase();
        const gName = (r.guestName || "").toLowerCase();
        const resNum = (r.reservationNumber || r.id || "").toLowerCase();
        const rNum = (r.rooms?.number || r.roomDescription || "").toLowerCase();
        return gName.includes(q) || resNum.includes(q) || rNum.includes(q);
      })
    : [];

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoadingReservations} message="Buscando reservas..." submessage="Estamos carregando as reservas mais recentes do hotel." />

      {/* Banner & Tab Selector */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#0284C7]" />
            Mapa de Reserva dos Quartos & Automação Wpp Uazapi
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Matriz interativa de reservas, drag & drop de datas, duplo clique para reservar/editar e remoção por tecla Delete.
          </p>
        </div>

        {/* View Mode Tabs & New Reservation Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLancarModal(true)}
            className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#0284C7]/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Lançar Nova Reserva
          </button>

          <button
            onClick={() => setShowMultiplasModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all"
            title="Lançar várias reservas de uma vez, salvando tudo no final"
          >
            <Layers className="w-4 h-4 text-[#00b4d8]" />
            Reservas Múltiplas
          </button>

          <div className="flex items-center rounded-xl bg-[#1E293B] border border-slate-700 p-1">
            <button
              onClick={() => {
                setActiveTab("GRID");
                fetchReservations();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === "GRID"
                  ? "bg-[#0284C7] text-white shadow-lg shadow-[#0284C7]/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Mapa Visual (Grid)
            </button>
            <button
              onClick={() => {
                setActiveTab("LIST");
                fetchReservations();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === "LIST"
                  ? "bg-[#0284C7] text-white shadow-lg shadow-[#0284C7]/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <List className="w-4 h-4" />
              Lista Sintética
            </button>
          </div>
        </div>
      </div>

      {/* Uazapi Notification Alert */}
      {uazapiSentSuccess && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{uazapiSentSuccess}</span>
        </div>
      )}
      {uazapiSentError && (
        <div className="p-4 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-[#EF4444] text-xs font-semibold flex items-center gap-2">
          <span>{uazapiSentError}</span>
        </div>
      )}

      {/* RENDER VIEW BASED ON TAB */}
      {activeTab === "GRID" ? (
        <ReservationGridMap apiReservations={reservations} onRefresh={fetchReservations} />
      ) : (
        <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Lista de Reservas Ativas</h3>
              <button
                onClick={fetchReservations}
                className="p-1 text-slate-400 hover:text-white transition-colors"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#0284C7]" : ""}`} />
              </button>
            </div>
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por hóspede, quarto ou reserva..."
                className="w-full bg-[#1E293B] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
                <th className="p-3.5">CÓDIGO / HÓSPEDE</th>
                <th className="p-3.5">ACOMODAÇÃO</th>
                <th className="p-3.5">PERÍODO</th>
                <th className="p-3.5">VALOR TOTAL / ADIANT.</th>
                <th className="p-3.5">FNRH PRE-CHECKIN</th>
                <th className="p-3.5">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs">
                    {loading ? "Carregando reservas..." : "Nenhuma reserva encontrada."}
                  </td>
                </tr>
              ) : (
                filteredReservations.map((r) => {
                  const checkInFmt = r.checkInDate ? new Date(r.checkInDate).toLocaleDateString("pt-BR") : "";
                  const checkOutFmt = r.checkOutDate ? new Date(r.checkOutDate).toLocaleDateString("pt-BR") : "";
                  const roomName = r.rooms?.number
                    ? `Quarto ${r.rooms.number}${r.rooms.room_categories?.name ? " - " + r.rooms.room_categories.name : ""}`
                    : r.roomDescription || "Acomodação";

                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{r.guestName}</div>
                        <span className="font-mono text-[10px] text-[#0284C7]">
                          {r.reservationNumber || r.id} • CPF: {r.guestCpf || r.cpf || "—"}
                        </span>
                        {r.tariffName && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Tarifa: {r.tariffName}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-200 font-medium">{roomName}</td>
                      <td className="p-3.5 font-mono text-slate-300">
                        {checkInFmt} a {checkOutFmt}
                      </td>
                      <td className="p-3.5 font-mono">
                        <div className="font-semibold text-white">
                          R$ {(parseFloat(r.totalAmount) || 0).toFixed(2)}
                        </div>
                        <span className="text-[10px] text-[#10B981]">
                          Adiant.: R$ {(parseFloat(r.depositPaid) || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {r.fnrhCompleted ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> Preenchido / FNRH OK
                          </span>
                        ) : r.preCheckinSent ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" /> Aguardando Preenchimento
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" /> Pendente Envio
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <button
                          onClick={() => handleSendUazapiLink(r.id)}
                          disabled={sendingLinkId === r.id}
                          className="px-3 py-1 bg-[#38BDF8]/15 hover:bg-[#38BDF8]/30 disabled:opacity-50 disabled:cursor-not-allowed text-[#38BDF8] border border-[#38BDF8]/30 rounded text-xs transition-colors flex items-center gap-1 font-medium"
                        >
                          <WhatsAppIcon className="w-3 h-3 text-[#25D366]" /> {sendingLinkId === r.id ? "Enviando..." : r.preCheckinSent ? "Reenviar Link" : "Enviar FNRH"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE LANÇAMENTO DE RESERVA */}
      <LancarReservaModal
        isOpen={showLancarModal}
        onClose={() => setShowLancarModal(false)}
        onSuccess={() => {
          fetchReservations();
        }}
        existingReservations={reservations}
        tenantId="TNT-01"
      />

      {/* MODAL DE RESERVAS MÚLTIPLAS */}
      <ReservasMultiplasModal
        isOpen={showMultiplasModal}
        onClose={() => setShowMultiplasModal(false)}
        onSuccess={() => {
          fetchReservations();
        }}
        existingReservations={reservations}
        tenantId="TNT-01"
      />
    </div>
  );
}

