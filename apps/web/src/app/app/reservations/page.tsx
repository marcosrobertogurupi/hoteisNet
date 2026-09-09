"use client";

import { useState, useCallback, useEffect } from "react";
import { CalendarDays, Plus, Layers, Search, Building2, CheckCircle2, Clock, LayoutGrid, List, RefreshCw, Hourglass } from "lucide-react";
import ReservationGridMap from "@/components/ReservationGridMap";
import LancarReservaModal from "@/components/LancarReservaModal";
import ReservasMultiplasModal from "@/components/ReservasMultiplasModal";
import WaitlistPanel from "@/components/WaitlistPanel";
import { useTheme } from "@/context/ThemeContext";
import { isReservationExpired } from "@/utils/reservationTolerance";
import LoadingOverlay from "@/components/LoadingOverlay";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { usePolling } from "@/lib/usePolling";

export default function TenantReservationsPage() {
  const { defaultCheckInTime, reservationToleranceHours, theme } = useTheme();
  const isDark = theme.isDark;
  const cardCls = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const borderCls = isDark ? "border-slate-800" : "border-slate-200";
  const headingCls = isDark ? "text-white" : "text-slate-900";
  const mutedCls = isDark ? "text-slate-400" : "text-slate-500";
  const faintCls = isDark ? "text-slate-500" : "text-slate-400";
  const tabWrapCls = isDark ? "bg-[#1E293B] border-slate-700" : "bg-slate-100 border-slate-200";
  const tabInactiveCls = isDark
    ? "text-slate-400 hover:text-slate-200"
    : "text-slate-500 hover:text-slate-800";
  const theadCls = isDark
    ? "bg-[#1E293B]/60 text-slate-400 border-slate-800"
    : "bg-slate-100 text-slate-500 border-slate-200";
  const rowDivideCls = isDark ? "divide-slate-800/60" : "divide-slate-200";
  const rowHoverCls = isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50";
  const cellStrongCls = isDark ? "text-slate-200" : "text-slate-700";
  const cellMedCls = isDark ? "text-slate-300" : "text-slate-600";
  const inputCls = isDark
    ? "bg-[#1E293B] border-slate-700 text-white"
    : "bg-white border-slate-300 text-slate-900";
  const multiBtnCls = isDark
    ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-white"
    : "bg-white hover:bg-slate-100 border-slate-300 text-slate-800";
  const [activeTab, setActiveTab] = useState<"GRID" | "LIST" | "WAITLIST">("GRID");
  const [waitlistActiveCount, setWaitlistActiveCount] = useState(0);
  const [showLancarModal, setShowLancarModal] = useState(false);
  const [showMultiplasModal, setShowMultiplasModal] = useState(false);
  const [uazapiSentSuccess, setUazapiSentSuccess] = useState<string | null>(null);
  const [uazapiSentError, setUazapiSentError] = useState<string | null>(null);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingReservations, setIsLoadingReservations] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [reservations, setReservations] = useState<any[]>([]);
  // Quartos (estado enxuto) e tarefas de governança vêm no mesmo tick e são repassados ao
  // ReservationGridMap — antes o componente buscava os dois por conta própria, somando 3
  // requisições por tick nesta tela.
  const [gridRooms, setGridRooms] = useState<any[]>([]);
  const [housekeepingTasks, setHousekeepingTasks] = useState<any[]>([]);
  // true enquanto o operador arrasta uma reserva no grid ou uma movimentação (PATCH) ainda não
  // foi confirmada pelo banco — pausa o polling de 3 s para o tick não sobrescrever a reserva
  // recém-movida com um retrato anterior (a reserva ficava alternando entre os dois quartos).
  const [reservationMoveBusy, setReservationMoveBusy] = useState(false);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      // Uma única requisição por tick — /api/mapa/reservas-tick devolve reservas + quartos +
      // tarefas de governança juntos, com ETag/304 quando nada mudou.
      const res = await fetch("/api/mapa/reservas-tick");
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.reservations)) setReservations(data.reservations);
        if (Array.isArray(data.gridRooms)) setGridRooms(data.gridRooms);
        if (Array.isArray(data.housekeepingTasks)) setHousekeepingTasks(data.housekeepingTasks);
      }
    } catch (err) {
      console.error("Erro ao buscar reservas:", err);
    } finally {
      setLoading(false);
      setIsLoadingReservations(false);
      // Concluído o refetch (inclusive o disparado logo após um drag & drop), o retrato já está
      // consistente com o banco — pode voltar a fazer polling.
      setReservationMoveBusy(false);
    }
  }, []);

  // Polling em segundo plano a cada 3 segundos, igual ao Mapa de Quartos — pausado enquanto o
  // modal "Lançar Nova Reserva" estiver aberto, para não sobrescrever dados que o operador esteja
  // digitando (padrão herdado do projeto original em WinDev: telas de mapa atualizam sozinhas,
  // janelas abertas por cima pausam a atualização).
  // Pausa também enquanto a aba está em segundo plano (ver usePolling) — o Mapa de Reservas só
  // precisa estar online para o operador que está de fato olhando para ele.
  usePolling(fetchReservations, 3000, {
    paused: showLancarModal || showMultiplasModal || reservationMoveBusy,
  });

  // Contagem da fila de espera para o badge da aba — uma chamada ao montar (não entra no polling
  // de 3 s para não inflar egress). O WaitlistPanel mantém o número atualizado enquanto a aba
  // está aberta via onActiveCountChange.
  useEffect(() => {
    fetch("/api/waitlist")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.entries)) setWaitlistActiveCount(d.entries.length);
      })
      .catch(() => {});
  }, []);

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
      <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${cardCls}`}>
        <div>
          <h2 className={`text-lg font-bold flex items-center gap-2 ${headingCls}`}>
            <CalendarDays className="w-5 h-5 text-[#0284C7]" />
            Mapa de Reserva dos Quartos
          </h2>
          <p className={`text-xs mt-1 ${mutedCls}`}>
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
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${multiBtnCls}`}
            title="Lançar várias reservas de uma vez, salvando tudo no final"
          >
            <Layers className="w-4 h-4 text-[#00b4d8]" />
            Reservas Múltiplas
          </button>

          <div className={`flex items-center rounded-xl border p-1 ${tabWrapCls}`}>
            <button
              onClick={() => {
                setActiveTab("GRID");
                fetchReservations();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === "GRID"
                  ? "bg-[#0284C7] text-white shadow-lg shadow-[#0284C7]/20"
                  : tabInactiveCls
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
                  : tabInactiveCls
              }`}
            >
              <List className="w-4 h-4" />
              Lista Sintética
            </button>
            <button
              onClick={() => setActiveTab("WAITLIST")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === "WAITLIST"
                  ? "bg-[#0284C7] text-white shadow-lg shadow-[#0284C7]/20"
                  : tabInactiveCls
              }`}
            >
              <Hourglass className="w-4 h-4" />
              Fila de Espera
              {waitlistActiveCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {waitlistActiveCount}
                </span>
              )}
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
        <ReservationGridMap
          apiReservations={reservations}
          gridRooms={gridRooms}
          housekeepingTasks={housekeepingTasks}
          onRefresh={fetchReservations}
          onInteractionChange={setReservationMoveBusy}
        />
      ) : activeTab === "WAITLIST" ? (
        <WaitlistPanel onActiveCountChange={setWaitlistActiveCount} />
      ) : (
        <div className={`rounded-2xl border overflow-hidden ${cardCls}`}>
          <div className={`p-4 border-b flex items-center justify-between ${borderCls}`}>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-semibold ${headingCls}`}>Lista de Reservas Ativas</h3>
              <button
                onClick={fetchReservations}
                className={`p-1 transition-colors ${mutedCls} ${isDark ? "hover:text-white" : "hover:text-slate-900"}`}
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
                className={`w-full border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-[#0284C7] ${inputCls}`}
              />
              <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${mutedCls}`} />
            </div>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`text-xs font-mono border-b ${theadCls}`}>
                <th className="p-3.5">CÓDIGO / HÓSPEDE</th>
                <th className="p-3.5">ACOMODAÇÃO</th>
                <th className="p-3.5">PERÍODO</th>
                <th className="p-3.5">VALOR TOTAL / ADIANT.</th>
                <th className="p-3.5">FNRH PRE-CHECKIN</th>
                <th className="p-3.5">AÇÕES</th>
              </tr>
            </thead>
            <tbody className={`divide-y text-xs ${rowDivideCls}`}>
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`p-8 text-center text-xs ${faintCls}`}>
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
                    <tr key={r.id} className={`transition-colors ${rowHoverCls}`}>
                      <td className="p-3.5">
                        <div className={`font-semibold ${headingCls}`}>{r.guestName}</div>
                        <span className="font-mono text-[10px] text-[#0284C7]">
                          {r.reservationNumber || r.id} • CPF: {r.guestCpf || r.cpf || "—"}
                        </span>
                        {r.tariffName && (
                          <span className={`text-[10px] block mt-0.5 ${mutedCls}`}>
                            Tarifa: {r.tariffName}
                          </span>
                        )}
                      </td>
                      <td className={`p-3.5 font-medium ${cellStrongCls}`}>{roomName}</td>
                      <td className={`p-3.5 font-mono ${cellMedCls}`}>
                        {checkInFmt} a {checkOutFmt}
                      </td>
                      <td className="p-3.5 font-mono">
                        <div className={`font-semibold ${headingCls}`}>
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
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#38BDF8]/15 text-[#0284C7] border border-[#38BDF8]/30 flex items-center gap-1 w-fit">
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
                          className="px-3 py-1 bg-[#38BDF8]/15 hover:bg-[#38BDF8]/30 disabled:opacity-50 disabled:cursor-not-allowed text-[#0284C7] border border-[#38BDF8]/30 rounded text-xs transition-colors flex items-center gap-1 font-medium"
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

