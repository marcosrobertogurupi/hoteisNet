"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  BedDouble, 
  UserCheck, 
  CalendarPlus, 
  FileCheck, 
  CheckCircle2, 
  Clock, 
  Wrench, 
  Sparkles, 
  Building2, 
  Check, 
  User,
  Search,
  ChevronRight,
  MoreVertical,
  Calendar,
  CreditCard,
  Printer,
  LogOut as LogOutIcon,
  MessageSquare,
  Wine,
  FileText,
  RefreshCw,
  Cpu,
  ArrowRightLeft,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Eye,
  EyeOff,
  X
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import AlterarPeriodoModal from "@/components/AlterarPeriodoModal";

import AlterarTarifaHospedagemModal from "@/components/AlterarTarifaHospedagemModal";
import CadastroTarifasModal, { INITIAL_TARIFFS, TariffItem } from "@/components/CadastroTarifasModal";
import CheckinHospedagemModal from "@/components/CheckinHospedagemModal";
import { ImprimirExtratoHospedagemModal } from "@/components/ImprimirExtratoHospedagemModal";
import { ImprimirResumoHospedagemModal } from "@/components/ImprimirResumoHospedagemModal";
import LancarPagamentoHospedagemModal from "@/components/LancarPagamentoHospedagemModal";
import LancarReservaModal from "@/components/LancarReservaModal";
import SelecaoReservaQuartoModal, { ReservaItemQuarto } from "@/components/SelecaoReservaQuartoModal";

interface RoomItem {
  id: string;
  number: string;
  category: string;
  status: "VACANT_CLEAN" | "OCCUPIED" | "OCCUPIED_CLEANING" | "VACANT_DIRTY" | "MAINTENANCE";
  guest: string | null;
  dates: string;
  notes?: string;
  maintenanceUntil?: string;
  fnrh?: boolean;
  corporate?: string | null;
  uazapiSent?: boolean;
  governess?: string;
  active?: boolean;
  ratePerNight?: number;
  totalConsumption?: number;
}

type FilterType = "ALL" | "VACANT_CLEAN" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";

export default function TenantDashboardPage() {
  const { theme, hotelLogo, hotelName, showLogoInPrint } = useTheme();
  const toast = useToast();

  // Modals & Action States

  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExtratoModal, setShowExtratoModal] = useState(false);
  const [showResumoModal, setShowResumoModal] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showWppModal, setShowWppModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showAlterarPeriodoModal, setShowAlterarPeriodoModal] = useState(false);
  const [showAlterarTarifaModal, setShowAlterarTarifaModal] = useState(false);
  const [showCadastroTarifasModal, setShowCadastroTarifasModal] = useState(false);
  const [showLancarPagamentoModal, setShowLancarPagamentoModal] = useState(false);
  const [showLancarReservaModal, setShowLancarReservaModal] = useState(false);
  // Check-in via reserva
  const [showSelecaoReservaModal, setShowSelecaoReservaModal] = useState(false);
  const [selectedRoomForReserva, setSelectedRoomForReserva] = useState<string>("101");
  // Reservas carregadas da API para o quarto selecionado no modal de seleção
  const [selecaoReservaList, setSelecaoReservaList] = useState<ReservaItemQuarto[]>([]);
  const [selecaoReservaLoading, setSelecaoReservaLoading] = useState(false);
  // Reserva selecionada para prosseguir com check-in
  const [reservaParaCheckin, setReservaParaCheckin] = useState<ReservaItemQuarto | null>(null);
  const [selectedTariffForCheckin, setSelectedTariffForCheckin] = useState<TariffItem>(INITIAL_TARIFFS[2]);


  const [activeRoom, setActiveRoom] = useState<RoomItem | null>(null);
  const [targetRoomNumber, setTargetRoomNumber] = useState<string>("101");
  const [showInactive, setShowInactive] = useState(false);

  const [maintenanceUntilInput, setMaintenanceUntilInput] = useState("20/08/2026 18:00");
  const [maintenanceNotesInput, setMaintenanceNotesInput] = useState("OS #402 Manutenção Geral");
  const [isSettingMaintenance, setIsSettingMaintenance] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    room: RoomItem | null;
  }>({ visible: false, x: 0, y: 0, room: null });

  // Filter and Search States
  const [statusFilter, setStatusFilter] = useState<FilterType>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // ─── Reservas do Dia (para sinais visuais de overbooking) ───────────────────
  // Chave: número do quarto (string), Valor: lista de reservas ativas para hoje
  const [todayReservationsByRoom, setTodayReservationsByRoom] = useState<Record<string, {
    id?: string;
    guestName: string;
    checkInTime: string;
    reservationNumber?: string;
  }[]>>({});

  // Room List State
  const [rooms, setRooms] = useState<RoomItem[]>([]);

  // Sincronização automática e transparente a partir do banco de dados (sem piscamento de tela)
  const syncRoomsFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/rooms?tenantId=tenant-hoteisnet-demo`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.rooms)) return;

      const savedDisabledStr = typeof window !== "undefined" ? localStorage.getItem("hoteisnet_disabled_rooms") : null;
      const disabledIds: string[] = savedDisabledStr ? JSON.parse(savedDisabledStr) : [];

      setRooms((prevRooms) => {
        const prevMap = new Map(prevRooms.map((r) => [r.number, r]));

        const updatedList: RoomItem[] = data.rooms.map((r: any) => {
          const roomNum = String(r.number);
          const existing = prevMap.get(roomNum);
          const isActive = !disabledIds.includes(r.id);

          const dbStatus = r.status || "VACANT_CLEAN";
          const dbNotes = r.notes || "Quarto Higienizado & Vistoriado";
          const dbCategory = r.category || r.room_categories?.name || "Standard";

          if (existing) {
            // Manter a mesma referência de objeto se nada mudou para garantir ZERO piscamento na UI
            if (
              existing.status === dbStatus &&
              existing.active === isActive &&
              existing.category === dbCategory &&
              existing.notes === dbNotes
            ) {
              return existing;
            }

            return {
              ...existing,
              status: dbStatus,
              category: dbCategory,
              notes: dbNotes,
              active: isActive,
              dates: dbStatus === "VACANT_CLEAN" ? "Disponível para Check-in" : existing.dates,
              guest: dbStatus === "VACANT_CLEAN" ? null : existing.guest,
            };
          }

          return {
            id: r.id,
            number: roomNum,
            category: dbCategory,
            status: dbStatus,
            guest: null,
            dates: dbStatus === "VACANT_CLEAN" ? "Disponível para Check-in" : "Disponível",
            notes: dbNotes,
            active: isActive,
            ratePerNight: r.ratePerNight || 180,
            totalConsumption: 0,
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[MapaQuartos] Erro na sincronização transparente:", err);
    }
  }, []);

  // Polling em segundo plano a cada 3 segundos
  useEffect(() => {
    syncRoomsFromDatabase();
    const interval = setInterval(syncRoomsFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncRoomsFromDatabase]);

  // ─── Reservas do Dia (Apenas para sinais visuais de overbooking / próximos check-ins) ─
  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    fetch(`/api/reservations?tenantId=tenant-hoteisnet-demo`)
      .then(r => r.json())
      .then(data => {
        if (!data.success || !Array.isArray(data.reservations)) return;
        const byRoom: Record<string, { id?: string; guestName: string; checkInTime: string; reservationNumber?: string; }[]> = {};
        for (const res of data.reservations) {
          if (res.status === "CANCELLED") continue;
          const checkInDate = (res.checkInDate || "").split("T")[0];
          if (checkInDate !== todayStr) continue;
          const roomNum = res.rooms?.number ? String(res.rooms.number) : (res.roomDescription?.match(/\d+/)?.[0] || "");
          if (!roomNum) continue;
          if (!byRoom[roomNum]) byRoom[roomNum] = [];
          byRoom[roomNum].push({
            id: res.id,
            guestName: res.guestName || "Hóspede",
            checkInTime: res.checkInTime || "14:00",
            reservationNumber: res.reservationNumber || res.id,
          });
        }
        setTodayReservationsByRoom(byRoom);
      })
      .catch(err => console.warn("[MapaQuartos] Erro ao buscar reservas do dia:", err));
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) setContextMenu(prev => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu.visible]);

  const handleOpenContextMenu = (e: React.MouseEvent, room: RoomItem) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveRoom(room);
    setContextMenu({
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 280),
      y: Math.min(e.clientY, window.innerHeight - 450),
      room,
    });
  };

  // Abre o modal de seleção de reserva buscando dados reais da API
  const openSelecaoReservaModal = async (room: RoomItem) => {
    setActiveRoom(room);
    setSelectedRoomForReserva(room.number);
    setSelecaoReservaList([]);
    setSelecaoReservaLoading(true);
    setShowSelecaoReservaModal(true);

    try {
      const res = await fetch(`/api/reservations?tenantId=TNT-01`);
      const data = await res.json();
      if (data.success && Array.isArray(data.reservations)) {
        // Filtrar reservas do quarto específico (ativas/confirmadas)
        const roomReservations: ReservaItemQuarto[] = data.reservations
          .filter((r: any) => {
            if (r.status === "CANCELLED") return false;
            const roomNum = r.rooms?.number ? String(r.rooms.number) : (r.roomDescription?.match(/\d+/)?.[0] || "");
            return roomNum === room.number;
          })
          .map((r: any) => ({
            id: r.id,
            reservationNumber: r.reservationNumber || r.id,
            guestName: (r.guestName || "HÓSPEDE").toUpperCase(),
            cpf: r.guestCpf || r.cpf || "",
            phone: r.guestPhone || r.phone || "",
            checkInDate: `${(r.checkInDate || "").split("T")[0]} ${r.checkInTime || "14:00"}`,
            checkOutDate: `${(r.checkOutDate || "").split("T")[0]} ${r.checkOutTime || "12:00"}`,
            checkInTime: r.checkInTime || "14:00",
            checkOutDateRaw: (r.checkOutDate || "").split("T")[0],
            checkInDateRaw: (r.checkInDate || "").split("T")[0],
            status: r.status || "CONFIRMADA",
            totalAmount: parseFloat(r.totalAmount || 0),
            depositPaid: parseFloat(r.depositPaid || 0),
            dailyRate: parseFloat(r.dailyRate || 0),
            tariffName: r.tariffName || "Tarifa Padrão",
            company: r.company || undefined,
            notes: r.notes || undefined,
          }));
        setSelecaoReservaList(roomReservations);
      }
    } catch (err) {
      console.error("[openSelecaoReservaModal] Erro ao buscar reservas:", err);
    } finally {
      setSelecaoReservaLoading(false);
    }
  };

  // Status Counters
  const counts = {
    ALL: rooms.filter(r => showInactive || r.active !== false).length,
    VACANT_CLEAN: rooms.filter(r => (showInactive || r.active !== false) && r.status === "VACANT_CLEAN").length,
    OCCUPIED: rooms.filter(r => (showInactive || r.active !== false) && (r.status === "OCCUPIED" || r.status === "OCCUPIED_CLEANING")).length,
    CLEANING: rooms.filter(r => (showInactive || r.active !== false) && (r.status === "VACANT_DIRTY" || r.status === "OCCUPIED_CLEANING")).length,
    MAINTENANCE: rooms.filter(r => (showInactive || r.active !== false) && r.status === "MAINTENANCE").length,
    INACTIVE: rooms.filter(r => r.active === false).length,
  };

  // Filtered rooms logic
  const filteredRooms = rooms.filter(room => {
    if (!showInactive && room.active === false) return false;

    let matchesStatus = true;
    if (statusFilter === "VACANT_CLEAN") matchesStatus = room.status === "VACANT_CLEAN";
    else if (statusFilter === "OCCUPIED") matchesStatus = room.status === "OCCUPIED" || room.status === "OCCUPIED_CLEANING";
    else if (statusFilter === "CLEANING") matchesStatus = room.status === "VACANT_DIRTY" || room.status === "OCCUPIED_CLEANING";
    else if (statusFilter === "MAINTENANCE") matchesStatus = room.status === "MAINTENANCE";

    const query = searchTerm.toLowerCase().trim();
    const matchesSearch = !query || 
      room.number.toLowerCase().includes(query) ||
      room.category.toLowerCase().includes(query) ||
      (room.guest && room.guest.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  const filterTabs = [
    {
      id: "ALL" as FilterType,
      label: "Todos os Quartos",
      count: counts.ALL,
      icon: <BedDouble className="w-4 h-4" />,
      activeClass: "bg-[#0284C7] text-white border-[#0284C7]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "VACANT_CLEAN" as FilterType,
      label: "Livres / Limpos",
      count: counts.VACANT_CLEAN,
      icon: <CheckCircle2 className="w-4 h-4 text-[#10B981]" />,
      activeClass: "bg-[#10B981] text-white border-[#10B981]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "OCCUPIED" as FilterType,
      label: "Ocupados",
      count: counts.OCCUPIED,
      icon: <User className="w-4 h-4 text-[#38BDF8]" />,
      activeClass: "bg-[#0284C7] text-white border-[#0284C7]",
      badgeActiveClass: "bg-white/20 text-white"
    },
    {
      id: "CLEANING" as FilterType,
      label: "Em Limpeza / Checkout",
      count: counts.CLEANING,
      icon: <Clock className="w-4 h-4 text-[#EAB308]" />,
      activeClass: "bg-[#EAB308] text-slate-950 border-[#EAB308]",
      badgeActiveClass: "bg-slate-950/20 text-slate-950 font-bold"
    },
    {
      id: "MAINTENANCE" as FilterType,
      label: "Manutenção",
      count: counts.MAINTENANCE,
      icon: <Wrench className="w-4 h-4 text-slate-400" />,
      activeClass: "bg-slate-700 text-white border-slate-600",
      badgeActiveClass: "bg-slate-900 text-slate-300"
    },
  ];

  return (
    <div className="space-y-6 pb-12 relative">
      {/* Main SaaS Page View Container (Hidden when printing reports) */}
      <div className="space-y-6 print:hidden">
        {/* Top Header & Search Bar */}
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border shadow-xl ${theme.bgCard}`}>
          <div className="flex items-center gap-3">
            <div 
              style={{ backgroundColor: theme.primaryColor }}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shrink-0 text-xl"
            >
              {hotelName ? hotelName.charAt(0) : "H"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Mapa Operacional de Acomodações
              </h1>
              <p className={`text-xs ${theme.textMuted}`}>
                {hotelName} • Clique com o botão direito em um quarto para acessar o menu completo de funções WinDev.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3 top-3 ${theme.textMuted}`} />
              <input
                type="text"
                placeholder="Buscar por quarto, hóspede..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-[#34598F] w-64 ${
                  theme.isDark 
                    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500" 
                    : "bg-slate-100 border-slate-300 text-slate-900 placeholder-slate-400"
                }`}
              />
            </div>

            {/* Toggle Inactive Filter */}
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showInactive 
                  ? "bg-red-950/60 border-red-800 text-red-300" 
                  : theme.isDark
                    ? "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    : "bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900"
              }`}
            >
              {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Inativos ({counts.INACTIVE})
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={`flex flex-wrap items-center gap-2 border-b pb-3 ${theme.borderColor}`}>
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 border ${
                statusFilter === tab.id
                  ? tab.activeClass
                  : theme.isDark
                    ? "bg-[#0F172A] text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800/60"
                    : "bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100 shadow-sm"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === tab.id 
                  ? tab.badgeActiveClass 
                  : theme.isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Room Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRooms.map(room => {
            const isOccupied = room.status === "OCCUPIED" || room.status === "OCCUPIED_CLEANING";
            const isCleaning = room.status === "VACANT_DIRTY" || room.status === "OCCUPIED_CLEANING";
            const isMaintenance = room.status === "MAINTENANCE";
            const isVacantClean = room.status === "VACANT_CLEAN";
            const isInactive = room.active === false;

            // Reservas do dia para este quarto (sinal de overbooking)
            const todayResForRoom = todayReservationsByRoom[room.number] || [];
            const hasTodayReservation = todayResForRoom.length > 0;
            const firstTodayRes = hasTodayReservation ? todayResForRoom[0] : null;

            let cardBg = theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 shadow-sm";
            let badgeBg = theme.isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-200 text-slate-800 border-slate-300";
            let statusText = "Livre / Limpo";

            if (isInactive) {
              cardBg = "bg-red-950/10 border-red-900/40 opacity-70";
              badgeBg = "bg-red-500/20 text-red-400 border-red-500/30";
              statusText = "DESATIVADO";
            } else if (isOccupied) {
              cardBg = theme.isDark ? "bg-[#0284C7]/5 border-[#0284C7]/40" : "bg-sky-50/70 border-sky-300 shadow-sm";
              badgeBg = "bg-[#184176] text-white border-[#184176] font-bold";
              statusText = "Ocupado";
            } else if (isCleaning) {
              cardBg = theme.isDark ? "bg-[#EAB308]/5 border-[#EAB308]/40" : "bg-amber-50/70 border-amber-300 shadow-sm";
              badgeBg = "bg-[#D97706] text-white border-[#D97706] font-bold";
              statusText = room.status === "OCCUPIED_CLEANING" ? "Limpeza c/ Hóspede" : "Checkout / Limpeza";
            } else if (isMaintenance) {
              cardBg = theme.isDark ? "bg-slate-900 border-slate-700" : "bg-slate-100 border-slate-300 shadow-sm";
              badgeBg = "bg-slate-600 text-white border-slate-600 font-bold";
              statusText = "Manutenção";
            } else if (isVacantClean) {
              cardBg = theme.isDark ? "bg-[#10B981]/5 border-[#10B981]/40" : "bg-emerald-50/70 border-emerald-300 shadow-sm";
              badgeBg = "bg-emerald-600 text-white border-emerald-600 font-bold";
              statusText = "Livre / Higienizado";
            }

            return (
              <div
                key={room.id}
                onContextMenu={(e) => handleOpenContextMenu(e, room)}
                className={`group relative p-5 rounded-2xl border ${
                  // Borda pulsante extra quando há reserva hoje + quarto ocupado ou em manutenção
                  hasTodayReservation && (isOccupied || isMaintenance)
                    ? "ring-2 ring-offset-1 " + (isMaintenance ? "ring-red-500 ring-offset-slate-950" : "ring-red-500/70 ring-offset-slate-950")
                    : ""
                } ${cardBg} shadow-lg transition-all duration-200 hover:border-slate-400 flex flex-col justify-between space-y-4`}
              >

                {/* ⚠️ BANNER DE ALERTA: RESERVA PARA O DIA */}
                {hasTodayReservation && (
                  <div className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-lg border whitespace-nowrap ${
                    isMaintenance
                      ? "bg-red-600 text-white border-red-400 animate-pulse shadow-red-600/40 shadow-xl"
                      : isOccupied
                      ? "bg-red-600 text-white border-red-400 animate-pulse shadow-red-600/40 shadow-xl"
                      : isCleaning && !isOccupied
                      ? "bg-orange-500 text-white border-orange-400 shadow-orange-500/40 shadow-md"
                      : "bg-emerald-700 text-white border-emerald-500 shadow-emerald-700/30 shadow-sm"
                  }`}>
                    {isMaintenance ? (
                      <><AlertTriangle className="w-3 h-3 shrink-0" /> MANUÇÃO + RESERVA HOJE!</>
                    ) : isOccupied ? (
                      <><AlertTriangle className="w-3 h-3 shrink-0" /> OCUPADO + RESERVA HOJE!</>
                    ) : isCleaning && !isOccupied ? (
                      <><CalendarCheck className="w-3 h-3 shrink-0" /> LIMPEZA + RESERVA HOJE</>  
                    ) : (
                      <><CalendarCheck className="w-3 h-3 shrink-0" /> RESERVA HOJE {firstTodayRes?.checkInTime}</>
                    )}
                  </div>
                )}

                {/* Top Header Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div 
                      style={{ backgroundColor: isVacantClean ? "#10B981" : isOccupied ? "#184176" : isCleaning ? "#D97706" : "#475569" }}
                      className="w-11 h-11 rounded-xl text-white font-mono font-bold flex items-center justify-center text-lg shadow-md shrink-0"
                    >
                      {room.number}
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm tracking-tight ${theme.textMain}`}>{room.category}</h3>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${badgeBg}`}>
                        {statusText}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Dots */}
                  <div className="relative">
                    <button
                      onClick={(e) => handleOpenContextMenu(e, room)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        theme.isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"
                      }`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Guest & Stay Details */}
                {isMaintenance ? (
                  <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                    theme.isDark ? "bg-slate-900/90 border-slate-800" : "bg-slate-100 border-slate-300"
                  }`}>
                    <div className="flex items-center justify-between font-medium">
                      <span className="flex items-center gap-1.5 text-[#D97706] font-semibold">
                        <Wrench className="w-3.5 h-3.5" /> Quarto em Manutenção
                      </span>
                    </div>
                    <div className={`flex items-center justify-between text-[11px] pt-1.5 border-t ${theme.borderColor} ${theme.textMuted}`}>
                      <span>Data Limite p/ Desbloqueio:</span>
                      <span className="font-mono font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        {room.maintenanceUntil || "20/08/2026 18:00"}
                      </span>
                    </div>
                    {room.notes && (
                      <p className={`text-[10px] italic ${theme.textMuted}`}>
                        Motivo: {room.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl border space-y-2 text-xs ${
                    theme.isDark ? "bg-slate-950/60 border-slate-800/80" : "bg-slate-100/90 border-slate-200"
                  }`}>
                    {room.guest ? (
                      <div className="flex items-center justify-between">
                        <span className={theme.textMuted}>Hóspede:</span>
                        <span className={`font-bold truncate max-w-[150px] ${theme.textMain}`}>{room.guest}</span>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between ${theme.textMuted}`}>
                        <span>Sem hospedagem ativa</span>
                      </div>
                    )}

                    {room.dates && !room.dates.includes("Disponível") && !room.dates.toLowerCase().includes("checkout") && !room.dates.toLowerCase().includes("bloqueado") && !room.dates.toLowerCase().includes("manutenção") && (
                      <div className={`flex items-center justify-between ${theme.textMuted}`}>
                        <span>Período / Status:</span>
                        <span className={`font-mono ${theme.isDark ? "text-slate-200" : "text-slate-800"}`}>{room.dates}</span>
                      </div>
                    )}

                    {isOccupied && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-700/40">
                        <span className="font-semibold text-amber-500">Consumo Acumulado:</span>
                        <span className="font-mono font-bold text-amber-500">
                          R$ {(room.totalConsumption || 0).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 🔔 PAINEL DE DETALHE: PRÓXIMA RESERVA DO DIA */}
                {hasTodayReservation && firstTodayRes && (
                  <div className={`mt-1 rounded-xl border px-3 py-2 space-y-1 text-[10px] font-mono ${ 
                    isMaintenance || isOccupied
                      ? "bg-red-950/30 border-red-600/40"
                      : isCleaning && !isOccupied
                      ? "bg-orange-950/30 border-orange-500/40"
                      : "bg-emerald-950/20 border-emerald-600/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold flex items-center gap-1 ${
                        isMaintenance || isOccupied ? "text-red-400" : isCleaning && !isOccupied ? "text-orange-400" : "text-emerald-400"
                      }`}>
                        <CalendarCheck className="w-3 h-3 shrink-0" />
                        Próximo Check-in
                      </span>
                      <span className={`font-bold px-1.5 py-0.5 rounded ${
                        isMaintenance || isOccupied
                          ? "bg-red-600/30 text-red-300"
                          : isCleaning && !isOccupied
                          ? "bg-orange-500/30 text-orange-300"
                          : "bg-emerald-600/20 text-emerald-300"
                      }`}>
                        Hoje às {firstTodayRes.checkInTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Hóspede:</span>
                      <span className="text-white font-bold truncate max-w-[140px] uppercase">{firstTodayRes.guestName}</span>
                    </div>
                    {firstTodayRes.reservationNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Reserva:</span>
                        <span className="text-slate-300">{firstTodayRes.reservationNumber}</span>
                      </div>
                    )}
                    {todayResForRoom.length > 1 && (
                      <div className="text-center text-amber-400 font-bold pt-0.5 border-t border-amber-500/20">
                        ⚠️ +{todayResForRoom.length - 1} reserva(s) adicional(is) para hoje!
                      </div>
                    )}
                  </div>
                )}

                {/* Card Action Bar */}
                <div className="pt-1 border-t border-slate-800/40 flex items-center justify-between gap-1.5">
                  {isOccupied ? (
                    <>
                      <button
                        onClick={() => { setActiveRoom(room); setShowConsumptionModal(true); }}
                        className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border shadow-sm ${
                          theme.isDark
                            ? "bg-[#0284C7]/20 hover:bg-[#0284C7]/30 text-[#38BDF8] border-[#0284C7]/40"
                            : "bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-300"
                        }`}
                      >
                        + Consumo
                      </button>
                      <button
                        onClick={() => { setActiveRoom(room); setShowExtratoModal(true); }}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border shadow-sm ${
                          theme.isDark
                            ? "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border-cyan-800/60"
                            : "bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border-cyan-300"
                        }`}
                        title="Imprimir Extrato de Hospedagem (Detalhamento & Whats)"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#00BCD4]" /> Extrato
                      </button>
                      <button
                        onClick={() => { setActiveRoom(room); setShowResumoModal(true); }}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 border shadow-sm ${
                          theme.isDark
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                        }`}
                        title="Imprimir Resumo de Hospedagem"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-500" /> Resumo
                      </button>
                    </>
                  ) : isCleaning ? (
                    <button
                      onClick={() => { setActiveRoom(room); setShowStatusModal(true); }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm ${
                        theme.isDark
                          ? "bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 border-amber-800/60"
                          : "bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Alterar Situação
                    </button>
                  ) : isMaintenance ? (
                    <button
                      onClick={() => { setActiveRoom(room); setShowStatusModal(true); }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm ${
                        theme.isDark
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                          : "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Alterar Situação
                    </button>
                  ) : (
                    // Quarto livre: verificar se tem reserva para o dia
                    hasTodayReservation ? (
                      // BLOQUEIO: Tem reserva para hoje — não permite check-in avulso
                      <div className="w-full space-y-1.5">
                        <div className="w-full py-2 px-3 rounded-xl bg-red-950/40 border border-red-600/40 text-red-300 text-xs font-bold flex items-center justify-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                          Check-in Avulso BLOQUEADO
                        </div>
                        <button
                          onClick={() => {
                            openSelecaoReservaModal(room);
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" /> Check-in pela Reserva
                        </button>
                      </div>
                    ) : (
                      // Quarto livre sem reserva: check-in avulso liberado
                      <button
                        onClick={() => { setActiveRoom(room); setTargetRoomNumber(room.number); setShowCheckinModal(true); }}
                        className="w-full py-2 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Efetuar Check-in
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* CONTEXT MENU POPUP (BOTÃO DIREITO / TRÊS PONTOS NO QUARTO) */}
      {contextMenu.visible && contextMenu.room && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className={`fixed z-50 w-72 border rounded-2xl shadow-2xl overflow-hidden text-xs py-1.5 animate-in fade-in zoom-in-95 duration-100 ${
            theme.isDark ? "bg-[#0F172A] border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-800 shadow-2xl"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Room Title Header in Menu */}
          <div className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
            theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#0284C7] text-white font-mono font-bold flex items-center justify-center text-xs">
                {contextMenu.room.number}
              </span>
              <span className={`font-bold ${theme.isDark ? "text-white" : "text-slate-900"}`}>{contextMenu.room.category}</span>
            </div>
            <span className="text-[10px] opacity-60 font-mono">Painel Assinante</span>
          </div>

          <div className={`max-h-[380px] overflow-y-auto divide-y ${theme.isDark ? "divide-slate-800/80" : "divide-slate-200"}`}>
            {/* GROUP 1: RESERVA & CHECKIN */}
            <div className="py-1">
              {/* Efetuar Reserva - ALWAYS ENABLED */}
              <button
                onClick={() => {
                  if (contextMenu.room) {
                    setSelectedRoomForReserva(contextMenu.room.number);
                    setActiveRoom(contextMenu.room);
                  }
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  setShowLancarReservaModal(true);
                }}
                className={`w-full px-3.5 py-2 text-left font-medium hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                }`}
              >
                <CalendarPlus className="w-4 h-4 text-[#0284C7]" />
                Efetuar Reserva (Sempre Disponível)
              </button>

              <button
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    openSelecaoReservaModal(contextMenu.room);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                Alterar Reserva
              </button>

              {/* Efetuar Hospedagem - Bloqueado se quarto tiver reserva para hoje */}
              {(() => {
                const ctxRoom = contextMenu.room!;
                const ctxResForRoom = todayReservationsByRoom[ctxRoom.number] || [];
                const ctxHasTodayRes = ctxResForRoom.length > 0;
                const isCtxVacant = ctxRoom.status === "VACANT_CLEAN";

                if (isCtxVacant && ctxHasTodayRes) {
                  // Quarto livre com reserva: bloqueia check-in avulso e oferece via reserva
                  return (
                    <>
                      <button
                        disabled
                        className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 opacity-40 cursor-not-allowed text-red-400"
                        title="Este quarto possui reserva para hoje. Use 'Check-in pela Reserva'."
                      >
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        Hospedagem Avulsa BLOQUEADA (reserva ativa)
                      </button>
                      <button
                        onClick={() => {
                          setContextMenu(prev => ({ ...prev, visible: false }));
                          if (ctxRoom) {
                            openSelecaoReservaModal(ctxRoom);
                          }
                        }}
                        className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-bold ${
                          theme.isDark ? "text-sky-300" : "text-sky-700"
                        }`}
                      >
                        <CalendarCheck className="w-4 h-4 text-[#10B981]" />
                        Check-in pela Reserva
                      </button>
                    </>
                  );
                }

                return (
                  <button
                    disabled={ctxRoom.status !== "VACANT_CLEAN"}
                    onClick={() => {
                      setContextMenu(prev => ({ ...prev, visible: false }));
                      if (ctxRoom) {
                        setActiveRoom(ctxRoom);
                        setTargetRoomNumber(ctxRoom.number);
                        setShowCheckinModal(true);
                      }
                    }}
                    className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                      theme.isDark ? "text-slate-200" : "text-slate-800"
                    } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                  >
                    <UserCheck className="w-4 h-4 text-[#10B981]" />
                    Efetuar Hospedagem (Check-in)
                  </button>
                );
              })()}
            </div>

            {/* GROUP 2: HOSPEDAGEM OPERACIONAL */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAlterarPeriodoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                Alterar Período Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAlterarTarifaModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <DollarSign className="w-4 h-4 text-[#10B981]" />
                Alterar Tarifa da Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowLancarPagamentoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <CreditCard className="w-4 h-4 text-[#0284C7]" />
                Lançar Pagamento na Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  alert(`Transferência de Débitos do Quarto ${contextMenu.room?.number}`);
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <ArrowRightLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Transferência de Débitos
              </button>
            </div>

            {/* GROUP 3: IMPRESSÕES E CONSUMO */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowExtratoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-semibold ${
                  theme.isDark ? "text-cyan-300" : "text-cyan-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Printer className="w-4 h-4 text-[#00BCD4]" />
                Imprimir Extrato de Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowResumoModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <FileText className="w-4 h-4 text-[#F59E0B]" />
                Imprimir Resumo de Hospedagem
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowConsumptionModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800 font-medium"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Wine className="w-4 h-4 text-rose-500" />
                Lançar Consumo no Quarto
              </button>
            </div>

            {/* GROUP 4: WPP, OBSERVACAO & CHECKOUT */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  alert(`Encerrar hospedagem (Checkout) do Quarto ${contextMenu.room?.number}`);
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-red-600 hover:text-white flex items-center gap-2.5 transition-colors font-semibold ${
                  theme.isDark ? "text-red-400" : "text-red-700"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <LogOutIcon className="w-4 h-4" />
                Encerrar Hospedagem (Checkout)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowWppModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-emerald-600 hover:text-white flex items-center gap-2.5 transition-colors font-medium ${
                  theme.isDark ? "text-emerald-400" : "text-emerald-700"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Enviar Mensagem (WhatsApp Uazapi)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowNotesModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <FileText className="w-4 h-4 text-slate-500" />
                Observação da Hospedagem
              </button>
            </div>

            {/* GROUP 5: GESTAO DE SITUACAO & AUTOMACAO */}
            <div className="py-1">
              <button
                disabled={contextMenu.room.status === "OCCUPIED" || contextMenu.room.status === "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowStatusModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors font-medium ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                title={
                  contextMenu.room.status === "OCCUPIED" || contextMenu.room.status === "OCCUPIED_CLEANING"
                    ? "Quartos ocupados só alteram situação via Transferência ou Checkout"
                    : ""
                }
              >
                <RefreshCw className="w-4 h-4 text-[#0284C7]" />
                Mudar Situação Quarto
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowAutomationModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <Cpu className="w-4 h-4 text-[#F59E0B]" />
                Automação do Quarto (IoT / Smart Room)
              </button>

              <button
                disabled={contextMenu.room.status !== "OCCUPIED" && contextMenu.room.status !== "OCCUPIED_CLEANING"}
                onClick={() => {
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  if (contextMenu.room) {
                    setActiveRoom(contextMenu.room);
                    setShowTransferModal(true);
                  }
                }}
                className={`w-full px-3.5 py-2 text-left hover:bg-[#0284C7] hover:text-white flex items-center gap-2.5 transition-colors ${
                  theme.isDark ? "text-slate-200" : "text-slate-800"
                } disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                <ArrowRightLeft className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Transferência de Quarto
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL 0: EFETUAR CHECK-IN COM TARIFA E DADOS DA HOSPEDAGEM (PRINTS 1 & 2) */}

      {showCheckinModal && activeRoom && (
        <CheckinHospedagemModal
          isOpen={showCheckinModal}
          onClose={() => {
            setShowCheckinModal(false);
            setReservaParaCheckin(null);
          }}
          roomData={{
            number: activeRoom.number,
            description: "1 CAMA DE CASAL + 1 SOLTEIRO",
            location: "TÉRREO",
            category: activeRoom.category || "ESPECIAL",
            ratePerNight: reservaParaCheckin?.dailyRate || activeRoom.ratePerNight || 170,
          }}
          reservationData={reservaParaCheckin ? {
            reservationNumber: reservaParaCheckin.reservationNumber || reservaParaCheckin.id,
            guestName: reservaParaCheckin.guestName,
            phone: reservaParaCheckin.phone,
            checkInDate: reservaParaCheckin.checkInDate,
            checkOutDate: reservaParaCheckin.checkOutDate,
            totalAmount: reservaParaCheckin.totalAmount,
            depositPaid: reservaParaCheckin.depositPaid,
          } : undefined}
          onSuccess={async (checkinData) => {
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoom.id
                  ? {
                      ...r,
                      status: "OCCUPIED",
                      guest: checkinData.guestName,
                      dates: `Check-out: ${checkinData.checkOutDate.split(" ")[0]}`,
                      ratePerNight: checkinData.dailyRate,
                    }
                  : r
              )
            );

            // 1. Atualizar a reserva no banco de dados para status CHECKED_IN (Hospedagem Ativa)
            let targetResId = reservaParaCheckin?.id || todayReservationsByRoom[activeRoom.number]?.[0]?.id;

            try {
              // Se o ID da reserva não foi capturado no estado local, buscar dinamicamente na API de reservas
              if (!targetResId) {
                const apiRes = await fetch("/api/reservations?tenantId=TNT-01");
                const apiData = await apiRes.json();
                if (apiData.success && Array.isArray(apiData.reservations)) {
                  const match = apiData.reservations.find((r: any) => {
                    const rNum = r.rooms?.number ? String(r.rooms.number) : (String(r.roomId || "").match(/\d+/)?.[0] || r.roomDescription?.match(/\d+/)?.[0] || String(r.roomId || ""));
                    const st = String(r.status || "").toUpperCase();
                    return rNum === activeRoom.number && st !== "CANCELLED" && !["CHECKED_IN", "CHECKEDIN", "CHECK_IN", "OCCUPIED"].includes(st);
                  });
                  if (match) {
                    targetResId = match.id;
                  }
                }
              }

              if (targetResId) {
                // Atualizar reserva existente para status CHECKED_IN
                await fetch("/api/reservations", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: targetResId,
                    tenantId: "TNT-01",
                    roomId: activeRoom.number,
                    guestName: checkinData.guestName,
                    guestCpf: checkinData.documentNumber,
                    guestPhone: checkinData.phone,
                    checkInDate: checkinData.checkInDate,
                    checkOutDate: checkinData.checkOutDate,
                    dailyRate: checkinData.dailyRate,
                    totalAmount: checkinData.totalBruto,
                    status: "CHECKED_IN",
                  }),
                });
              } else {
                // Criar novo registro de hospedagem ativada no servidor com status CHECKED_IN
                await fetch("/api/reservations", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    tenantId: "TNT-01",
                    roomId: activeRoom.number,
                    guestName: checkinData.guestName,
                    guestCpf: checkinData.documentNumber,
                    guestPhone: checkinData.phone,
                    checkInDate: checkinData.checkInDate,
                    checkOutDate: checkinData.checkOutDate,
                    dailyRate: checkinData.dailyRate,
                    totalAmount: checkinData.totalBruto,
                    tariffId: checkinData.tariffId || "TAR-001",
                    tariffName: checkinData.tariffName || "APTO ESPECIAL DUPLO",
                    status: "CHECKED_IN",
                  }),
                });
              }
            } catch (err) {
              console.error("[Checkin] Erro ao registrar status CHECKED_IN no banco de dados:", err);
            }

            // 2. Remover da lista de reservas pendentes de hoje (apaga a badge visual de overbooking "RESERVA HOJE")
            setTodayReservationsByRoom((prev) => {
              const copy = { ...prev };
              delete copy[activeRoom.number];
              return copy;
            });

            setShowCheckinModal(false);
            setReservaParaCheckin(null);

            toast.success(
              `✓ Check-in efetuado com sucesso no Quarto ${activeRoom.number}!\n\n` +
              `Hóspede: ${checkinData.guestName}\n` +
              `Documento (${checkinData.documentType}): ${checkinData.documentNumber}\n` +
              `Tarifa: ${checkinData.tariffName} (R$ ${checkinData.dailyRate.toFixed(2)}/dia)\n` +
              `Diárias: ${checkinData.nights} diária(s) | Saldo a Pagar: R$ ${checkinData.balance.toFixed(2).replace(".", ",")}`,
              `Hospedagem Efetivada — Quarto ${activeRoom.number}`,
              6000
            );
          }}
        />
      )}

      {/* MODAL 1: LANÇAR CONSUMO NO QUARTO */}
      {showConsumptionModal && activeRoom && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                <Wine className="w-5 h-5 text-rose-500" /> Lançar Consumo • Quarto {activeRoom.number}
              </h3>
              <button onClick={() => setShowConsumptionModal(false)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>Item de Consumo (Minibar / Restaurante)</label>
                <select className={`w-full border rounded-xl p-2.5 outline-none ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}>
                  <option>Água Mineral sem Gás 500ml - R$ 6,00</option>
                  <option>Cerveja Heineken Long Neck - R$ 14,00</option>
                  <option>Refrigerante Coca-Cola Lata - R$ 8,00</option>
                  <option>Chocolate Kopenhagen - R$ 18,00</option>
                  <option>Porção de Batata Frita Restaurante - R$ 32,00</option>
                </select>
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>Quantidade</label>
                <input type="number" defaultValue="1" className={`w-full border rounded-xl p-2.5 outline-none ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`} />
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-end gap-2 ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <button onClick={() => setShowConsumptionModal(false)} className={`px-4 py-2 rounded-xl text-xs font-semibold ${theme.isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                Cancelar
              </button>
              <button
                onClick={() => {
                  setRooms(prev => prev.map(r => r.id === activeRoom.id ? { ...r, totalConsumption: (r.totalConsumption || 0) + 14 } : r));
                  setShowConsumptionModal(false);
                  alert(`Consumo lançado com sucesso no Quarto ${activeRoom.number}!`);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md"
              >
                Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXTRATO DE HOSPEDAGEM (TELA WINDEV & WHATSAPP) */}
      {showExtratoModal && activeRoom && (
        <ImprimirExtratoHospedagemModal
          isOpen={showExtratoModal}
          onClose={() => setShowExtratoModal(false)}
          roomData={{
            number: activeRoom.number,
            category: activeRoom.category,
            guestName: activeRoom.guest || "FAUSTO DE OLIVEIRA DA COSTA",
            cpf: "865.172.281-87",
            checkInDate: "23/01/2026 21:18:49",
            prevCheckOutDate: "24/01/2026 14:00:00",
            actualCheckOutDate: "11/08/2026 16:39:04",
            extrasAmount: 200,
            phone: "(62) 99988-7766",
          }}
        />
      )}

      {/* MODAL RESUMO DE HOSPEDAGEM (PDF IMPRESSÃO) */}
      {showResumoModal && activeRoom && (
        <ImprimirResumoHospedagemModal
          isOpen={showResumoModal}
          onClose={() => setShowResumoModal(false)}
          roomData={{
            number: activeRoom.number,
            category: activeRoom.category,
            guestName: activeRoom.guest || "FAUSTO DE OLIVEIRA DA COSTA",
            cpf: "865.172.281-87",
            checkInDate: "23/01/2026 21:18:49",
            prevCheckOutDate: "24/01/2026 14:00:00",
            calculatedUntil: "11/08/2026 16:37:11",
            diariasCount: 1,
            totalDiarias: 28140.0,
            totalConsumo: 62.0,
            outrosDebitos: 0.0,
            totalDespesas: 28202.0,
            pagamentosAmount: 0.0,
            totalAFaturar: 0.0,
            descontos: 0.0,
            saldoAPagar: 28202.0,
          }}
        />
      )}

      {/* MODAL 3: AUTOMAÇÃO IOT / SMART ROOM */}
      {showAutomationModal && activeRoom && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                <Cpu className="w-5 h-5 text-[#F59E0B]" /> Automação IoT • Quarto {activeRoom.number}
              </h3>
              <button onClick={() => setShowAutomationModal(false)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Relé de Energia Principal</span>
                  <span className="text-[10px] opacity-75">Cartão RFID / Economia de Energia</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-bold text-[10px]">LIGADO</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Ar-Condicionado Inverter</span>
                  <span className="text-[10px] opacity-75">Termostato: 22°C (Modo Auto)</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-600 font-bold text-[10px]">ATIVO</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <div>
                  <span className={`font-semibold block ${theme.isDark ? "text-white" : "text-slate-900"}`}>Fechadura Bluetooth / QrCode</span>
                  <span className="text-[10px] opacity-75">Bateria: 92% • Firmware OK</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 font-bold text-[10px]">TRAVADO</span>
              </div>
            </div>

            <div className={`pt-3 border-t flex items-center justify-end ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <button onClick={() => setShowAutomationModal(false)} className={`px-4 py-2 rounded-xl text-xs font-semibold ${theme.isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                Fechar Painel IoT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: MUDAR SITUAÇÃO DO QUARTO */}
      {showStatusModal && activeRoom && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
          <div className={`border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-bold text-base flex items-center gap-2 ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                <RefreshCw className="w-5 h-5 text-[#0284C7]" /> Alterar Situação • Quarto {activeRoom.number}
              </h3>
              <button 
                onClick={() => {
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                }} 
                className="opacity-70 hover:opacity-100 transition-opacity"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <button
                onClick={() => {
                  setRooms(prev => prev.map(r => r.id === activeRoom.id ? { 
                    ...r, 
                    status: "VACANT_CLEAN", 
                    guest: null, 
                    dates: "Disponível para Check-in",
                    maintenanceUntil: undefined,
                    notes: "Quarto Higienizado & Vistoriado"
                  } : r));
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                  toast.success(`Quarto ${activeRoom.number} alterado para Livre / Higienizado.`);
                }}
                className={`w-full p-3 rounded-xl border text-left font-semibold flex items-center justify-between transition-colors ${
                  theme.isDark ? "bg-[#10B981]/15 hover:bg-[#10B981]/25 border-[#10B981]/30 text-white" : "bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900"
                }`}
              >
                <span>🟢 Livre / Higienizado</span>
                <span className="text-[10px] text-[#10B981] font-bold">Pronto Recepção</span>
              </button>

              <button
                onClick={() => {
                  setRooms(prev => prev.map(r => r.id === activeRoom.id ? { 
                    ...r, 
                    status: "VACANT_DIRTY",
                    guest: null,
                    dates: "Checkout / Limpeza",
                    maintenanceUntil: undefined,
                    notes: "Pendente troca de enxoval & higienização"
                  } : r));
                  setShowStatusModal(false);
                  setIsSettingMaintenance(false);
                  toast.success(`Quarto ${activeRoom.number} alterado para Pendente Limpeza (Sujo).`);
                }}
                className={`w-full p-3 rounded-xl border text-left font-semibold flex items-center justify-between transition-colors ${
                  theme.isDark ? "bg-[#EAB308]/15 hover:bg-[#EAB308]/25 border-[#EAB308]/30 text-white" : "bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
                }`}
              >
                <span>🟡 Pendente Limpeza (Sujo)</span>
                <span className="text-[10px] text-[#EAB308] font-bold">Governança</span>
              </button>

              <div className={`rounded-xl border p-3 space-y-3 ${
                theme.isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-300 bg-amber-50"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-600 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-amber-500" /> Em Manutenção / Bloqueado
                  </span>
                  <span className="text-[10px] text-amber-600 font-mono font-bold">OS Manutenção</span>
                </div>

                <div className="space-y-2 pt-1 border-t border-amber-500/20">
                  <div>
                    <label className={`block font-semibold mb-1 text-[11px] ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Data Limite para Desbloqueio:
                    </label>
                    <input
                      type="text"
                      value={maintenanceUntilInput}
                      onChange={(e) => setMaintenanceUntilInput(e.target.value)}
                      placeholder="Ex: 20/08/2026 18:00"
                      className={`w-full border rounded-lg p-2 font-mono text-xs outline-none ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block font-semibold mb-1 text-[11px] ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Motivo / Observação da OS:
                    </label>
                    <input
                      type="text"
                      value={maintenanceNotesInput}
                      onChange={(e) => setMaintenanceNotesInput(e.target.value)}
                      placeholder="Ex: Manutenção no Ar-Condicionado (OS #402)"
                      className={`w-full border rounded-lg p-2 text-xs outline-none ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
                      }`}
                    />
                  </div>

                  <button
                    onClick={() => {
                      setRooms(prev => prev.map(r => r.id === activeRoom.id ? { 
                        ...r, 
                        status: "MAINTENANCE", 
                        guest: null,
                        dates: "Bloqueado para Manutenção",
                        maintenanceUntil: maintenanceUntilInput || "20/08/2026 18:00",
                        notes: maintenanceNotesInput || "Em Manutenção"
                      } : r));
                      setShowStatusModal(false);
                      setIsSettingMaintenance(false);
                      toast.warning(`Quarto ${activeRoom.number} colocado em Manutenção / Bloqueado.`);
                    }}
                    className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    Confirmar Bloqueio / Manutenção
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ALTERAR PERÍODO HOSPEDAGEM MODAL */}
      {showAlterarPeriodoModal && activeRoom && (
        <AlterarPeriodoModal
          isOpen={showAlterarPeriodoModal}
          onClose={() => setShowAlterarPeriodoModal(false)}
          stayData={{
            idHospedagem: `2627`,
            roomNumber: activeRoom.number,
            roomCategory: activeRoom.category,
            guestName: activeRoom.guest || "HÓSPEDE REGISTRADO",
            cpf: "64320430182",
            checkInDate: "06/02/2026 16:24:42",
            checkOutDate: "07/02/2026 14:00:00",
            ratePerNight: activeRoom.ratePerNight || 170,
            tariffName: "APTO ESPECIAL TRIPLO",
            roomDescription: "1 CAMA DE CASAL + 1 SOLTEIRO",
            totalConsumption: activeRoom.totalConsumption || 0,
            payments: [],
          }}
          onSave={(updatedData) => {
            // Update active room stay details in state
            setRooms(prev => prev.map(r => r.id === activeRoom.id ? {
              ...r,
              dates: `Check-out: ${updatedData.checkOutDate.split(" ")[0]}`,
              ratePerNight: updatedData.ratePerNight,
            } : r));
            alert(`Período de hospedagem atualizado com sucesso!\n\nNovo Check-out: ${updatedData.checkOutDate}\nTarifa: ${updatedData.tariffName} (R$ ${updatedData.ratePerNight.toFixed(2)}/dia)\nDiárias Totais: ${updatedData.totalNights}\nSaldo a Pagar: R$ ${updatedData.saldoAPagar.toFixed(2)}`);
          }}
        />
      )}

      {/* ALTERAR TARIFA DA HOSPEDAGEM MODAL (PRINTS 1 & 2) */}
      {showAlterarTarifaModal && activeRoom && (
        <AlterarTarifaHospedagemModal
          isOpen={showAlterarTarifaModal}
          onClose={() => setShowAlterarTarifaModal(false)}
          stayData={{
            idHospedagem: `2627`,
            cpf: "64320430182",
            guestName: activeRoom.guest || "CARLOS DAVI SOUZA FERREIRA",
            roomNumber: activeRoom.number,
            roomDescription: "1 CAMA DE CASA + 1 SOLTEIRO",
            checkInDate: "06/02/2026 16:24:42",
            checkOutDate: "07/02/2026 14:00:00",
            adults: 1,
            children: 0,
            nights: 1,
            totalBruto: activeRoom.ratePerNight || 170,
            totalAdvance: 0,
            discount: 0,
            totalConsumption: activeRoom.totalConsumption || 0,
          }}
          onSave={(updatedData) => {
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoom.id
                  ? {
                      ...r,
                      ratePerNight: updatedData.dailyRates[0]?.rateValue || r.ratePerNight,
                    }
                  : r
              )
            );
          }}
        />
      )}

      {/* CADASTRO DE TARIFAS MODAL (PRINT 3) */}
      {showCadastroTarifasModal && (
        <CadastroTarifasModal
          isOpen={showCadastroTarifasModal}
          onClose={() => setShowCadastroTarifasModal(false)}
        />
      )}

      {/* LANÇAR PAGAMENTO NA HOSPEDAGEM MODAL (WINDEV WIN_PAGAMENTOHOSPEDAGEM) */}
      {showLancarPagamentoModal && activeRoom && (
        <LancarPagamentoHospedagemModal
          isOpen={showLancarPagamentoModal}
          onClose={() => setShowLancarPagamentoModal(false)}
          stayData={{
            idHospedagem: `HPD-${activeRoom.number}`,
            roomNumber: activeRoom.number,
            primaryGuestName: activeRoom.guest || "PEDRO RICARDO DA SILVA FAGUNDES",
            checkInDate: "05/02/2026 13:08:42",
            expectedCheckOutDate: "08/02/2026 14:00:00",
            actualCheckOutDate: "12/08/2026 09:39:20",
            dailyCount: 3,
            extrasCount: 185,
            totalDiarias: (activeRoom.ratePerNight || 380) * 3,
            totalConsumo: activeRoom.totalConsumption || 28.0,
            outrosDebitos: 0.0,
            desconto: 0.0,
            guestsList: [
              { id: "G-1", name: activeRoom.guest || "PEDRO RICARDO DA SILVA FAGUNDES" }
            ],
          }}
          onSaveSuccess={(updatedData) => {
            setShowLancarPagamentoModal(false);
            toast.success(
              `Crédito/Pagamento salvo para o Quarto ${activeRoom.number}!\n\n` +
              `Total Pagamentos: R$ ${updatedData.totalPagamentos.toFixed(2)}\n` +
              `Saldo Restante: R$ ${updatedData.saldoAPagar.toFixed(2)}`,
              "Lançamento Salvo"
            );
          }}
        />
      )}

      {/* LANÇAR NOVA RESERVA COM QUARTO PRÉ-PREENCHIDO */}
      {showLancarReservaModal && (
        <LancarReservaModal
          isOpen={showLancarReservaModal}
          onClose={() => setShowLancarReservaModal(false)}
          initialRoomNumber={selectedRoomForReserva}
          tenantId="TNT-01"
          onSuccess={(resNum) => {
            setShowLancarReservaModal(false);
            toast.success(`Reserva ${resNum} criada com sucesso para o Quarto ${selectedRoomForReserva}!`, "Reserva Confirmada");
          }}
        />
      )}

      {showSelecaoReservaModal && (
        <SelecaoReservaQuartoModal
          isOpen={showSelecaoReservaModal}
          onClose={() => setShowSelecaoReservaModal(false)}
          roomNumber={selectedRoomForReserva}
          roomCategory={activeRoom?.category || "Acomodação"}
          reservations={selecaoReservaList}
          onSelectAlterarPeriodo={(res) => {
            setShowSelecaoReservaModal(false);
            setShowAlterarPeriodoModal(true);
          }}
          onSelectAlterarTarifa={(res) => {
            setShowSelecaoReservaModal(false);
            setShowAlterarTarifaModal(true);
          }}
          onSelectLancarPagamento={(res) => {
            setShowSelecaoReservaModal(false);
            setShowLancarPagamentoModal(true);
          }}
          onEfetuarCheckin={(res) => {
            // Abre modal de check-in pré-preenchido com os dados da reserva
            setReservaParaCheckin(res);
            setShowSelecaoReservaModal(false);
            setShowCheckinModal(true);
          }}
          onLancarNovaReservaQuarto={(roomNum) => {
            setSelectedRoomForReserva(roomNum);
            setShowLancarReservaModal(true);
          }}
          loading={selecaoReservaLoading}
        />
      )}
    </div>
  );
}

