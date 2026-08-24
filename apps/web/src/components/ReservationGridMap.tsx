"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  Building2, 
  X, 
  Search, 
  Lock,
  ArrowRightLeft,
  DollarSign,
  Info,
  UserCheck,
  Eye,
  Mail,
  MessageSquare,
  Printer,
  FileText,
  PhoneCall
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import LancarReservaModal from "@/components/LancarReservaModal";
import VisualizarReservaModal from "@/components/VisualizarReservaModal";
import { generateReservaPdfBase64 } from "@/utils/pdfGenerator";
import { isReservationExpired, getReservationExpirationDate, formatExpirationLimit } from "@/utils/reservationTolerance";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";

export interface ReservationItem {
  id: string;
  roomId: string;
  guestName: string;
  cpf: string;
  phone: string;
  checkInDate: string;  // YYYY-MM-DD
  checkInTime: string;  // HH:mm
  checkOutDate: string; // YYYY-MM-DD
  checkOutTime: string; // HH:mm
  mapEndDate?: string; // YYYY-MM-DD — data até onde o quarto está ocupado (diárias extras já lançadas), só para a barra visual
  dailyRate: number;
  depositPaid: number;
  totalAmount: number;
  status: "CONFIRMED" | "PRE_RESERVATION" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";
  company?: string;
  notes?: string;
  precheckinSent?: boolean;
  fnrhCompleted?: boolean;
}

export interface RoomDefinition {
  id: string;
  number: string;
  category: string;
  ratePerNight: number;
  isMaintenance?: boolean;
}

const DEFAULT_ROOMS: RoomDefinition[] = [
  { id: "101", number: "101", category: "Suíte Luxo Mar", ratePerNight: 350 },
  { id: "102", number: "102", category: "Suíte Luxo Mar", ratePerNight: 380 },
  { id: "103", number: "103", category: "Standard Superior", ratePerNight: 280 },
  { id: "104", number: "104", category: "Standard Superior", ratePerNight: 280 },
  { id: "105", number: "105", category: "Standard Superior", ratePerNight: 280 },
  { id: "106", number: "106", category: "Standard Superior", ratePerNight: 280 },
  { id: "107", number: "107", category: "Standard Superior", ratePerNight: 280 },
  { id: "108", number: "108", category: "Standard Superior", ratePerNight: 280 },
  { id: "109", number: "109", category: "Standard Superior", ratePerNight: 280 },
  { id: "110", number: "110", category: "Standard Superior", ratePerNight: 280 },
  { id: "111", number: "111", category: "Standard Superior", ratePerNight: 280 },
  { id: "201", number: "201", category: "Master Família", ratePerNight: 450, isMaintenance: true },
  { id: "202", number: "202", category: "Master Família", ratePerNight: 450 },
  { id: "203", number: "203", category: "Suíte Presidencial", ratePerNight: 750 },
  { id: "204", number: "204", category: "Suíte Presidencial", ratePerNight: 750 },
];

const DEFAULT_RESERVATIONS: ReservationItem[] = [
  {
    id: "RES-101",
    roomId: "101",
    guestName: "MARCELO LIMA NUNES",
    cpf: "111.222.333-44",
    phone: "(11) 98888-1111",
    checkInDate: "2026-08-06",
    checkInTime: "18:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "12:00",
    dailyRate: 350,
    depositPaid: 700,
    totalAmount: 2100,
    status: "CONFIRMED",
    company: "Empresa Alfa",
    notes: "Entrada confirmada via recepção"
  },
  {
    id: "RES-101-TURNOVER",
    roomId: "101",
    guestName: "ROBERTO ALMEIDA SILVA",
    cpf: "333.444.555-66",
    phone: "(21) 97777-2222",
    checkInDate: "2026-08-12",
    checkInTime: "14:00",
    checkOutDate: "2026-08-16",
    checkOutTime: "12:00",
    dailyRate: 350,
    depositPaid: 350,
    totalAmount: 1400,
    status: "CONFIRMED",
    notes: "Turnover no dia 12/08 (Entrada às 14:00 após checkout das 12:00)"
  },
  {
    id: "HOSP-102",
    roomId: "102",
    guestName: "MARCOS OLIVEIRA",
    cpf: "222.333.444-55",
    phone: "(21) 99999-2222",
    checkInDate: "2026-08-10",
    checkInTime: "14:00",
    checkOutDate: "2026-08-14",
    checkOutTime: "12:00",
    dailyRate: 380,
    depositPaid: 500,
    totalAmount: 1520,
    status: "CHECKED_IN",
    company: "Tech Corp",
    precheckinSent: true
  },
  {
    id: "HOSP-103",
    roomId: "103",
    guestName: "MARIANA SOUZA",
    cpf: "444.555.666-77",
    phone: "(31) 98888-4444",
    checkInDate: "2026-08-08",
    checkInTime: "14:00",
    checkOutDate: "2026-08-15",
    checkOutTime: "12:00",
    dailyRate: 280,
    depositPaid: 560,
    totalAmount: 1960,
    status: "CHECKED_IN",
    notes: "Quarto Ocupado - Hospedagem em vigência (Stay-over)"
  },
  {
    id: "HOSP-203",
    roomId: "203",
    guestName: "EMPRESA VALE S.A. (JOÃO)",
    cpf: "555.444.333-22",
    phone: "(41) 97777-5555",
    checkInDate: "2026-08-09",
    checkInTime: "14:00",
    checkOutDate: "2026-08-16",
    checkOutTime: "12:00",
    dailyRate: 750,
    depositPaid: 1500,
    totalAmount: 5250,
    status: "CHECKED_IN",
    company: "Vale S.A.",
    notes: "Suíte Presidencial - Hospedagem em vigência"
  },
  {
    id: "RES-103",
    roomId: "103",
    guestName: "CARLOS EDUARDO SILVA MENDES",
    cpf: "333.444.555-66",
    phone: "(31) 97777-3333",
    checkInDate: "2026-08-06",
    checkInTime: "18:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 300,
    totalAmount: 1680,
    status: "CONFIRMED"
  },
  {
    id: "RES-104",
    roomId: "104",
    guestName: "PEDRO HENRIQUE PAIM PINTO",
    cpf: "444.555.666-77",
    phone: "(41) 96666-4444",
    checkInDate: "2026-08-07",
    checkInTime: "17:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 1400,
    status: "CONFIRMED"
  },
  {
    id: "RES-105",
    roomId: "105",
    guestName: "MARIA VITORIA DA SILVA MAIA",
    cpf: "555.666.777-88",
    phone: "(51) 95555-5555",
    checkInDate: "2026-08-07",
    checkInTime: "19:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 1400,
    status: "CONFIRMED"
  },
  {
    id: "RES-105-AUG19",
    roomId: "105",
    guestName: "CLARA FERREIRA LIMA",
    cpf: "555.666.777-00",
    phone: "(51) 95555-4444",
    checkInDate: "2026-08-18",
    checkInTime: "14:00",
    checkOutDate: "2026-08-21",
    checkOutTime: "12:00",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 840,
    status: "CONFIRMED"
  },
  {
    id: "RES-106",
    roomId: "106",
    guestName: "ARYELLE MICHELLE ALVES DOS SANTOS MARINS",
    cpf: "666.777.888-99",
    phone: "(61) 94444-6666",
    checkInDate: "2026-08-05",
    checkInTime: "19:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 500,
    totalAmount: 1960,
    status: "CONFIRMED"
  },
  {
    id: "RES-109",
    roomId: "109",
    guestName: "PEDRO ANDRADE SILVA",
    cpf: "777.888.999-00",
    phone: "(71) 93333-7777",
    checkInDate: "2026-08-06",
    checkInTime: "17:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 1680,
    status: "CONFIRMED"
  },
  {
    id: "RES-110",
    roomId: "110",
    guestName: "GUSTAVO DE PAULA GRUPPI",
    cpf: "888.999.000-11",
    phone: "(81) 92222-8888",
    checkInDate: "2026-08-07",
    checkInTime: "17:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 1400,
    status: "CONFIRMED"
  },
  {
    id: "RES-111",
    roomId: "111",
    guestName: "LUCAS LUIZ MENDES DE MOURA",
    cpf: "999.000.111-22",
    phone: "(91) 91111-9999",
    checkInDate: "2026-08-07",
    checkInTime: "18:02",
    checkOutDate: "2026-08-12",
    checkOutTime: "14:02",
    dailyRate: 280,
    depositPaid: 280,
    totalAmount: 1400,
    status: "CONFIRMED"
  }
];

export interface ReservationGridMapProps {
  apiReservations?: any[];
  onRefresh?: () => void;
}

export default function ReservationGridMap({ apiReservations, onRefresh }: ReservationGridMapProps = {}) {
  const { theme, defaultCheckInTime, defaultCheckOutTime, reservationToleranceHours } = useTheme();
  const toast = useToast();
  const now = new Date();

  // State Management
  const [rooms, setRooms] = useState<RoomDefinition[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);

  // Selo visual "em limpeza" — tarefas de governança em andamento (IN_PROGRESS), indexadas por
  // roomId. CHECKOUT (limpeza profunda pós check-out) e OCCUPIED (arrumação com hóspede no quarto).
  const [housekeepingByRoomId, setHousekeepingByRoomId] = useState<Record<string, {
    type: "CHECKOUT" | "OCCUPIED";
    housekeeperName: string | null;
  }>>({});

  const syncHousekeepingTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenant/housekeeping-tasks`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.tasks)) return;
      const map: Record<string, { type: "CHECKOUT" | "OCCUPIED"; housekeeperName: string | null }> = {};
      for (const t of data.tasks) {
        if (t.status === "IN_PROGRESS") {
          map[t.roomId] = { type: t.type, housekeeperName: t.housekeeper?.name || null };
        }
      }
      setHousekeepingByRoomId(map);
    } catch (err) {
      console.warn("[ReservationGridMap] Erro ao sincronizar tarefas de governança:", err);
    }
  }, []);

  useEffect(() => {
    syncHousekeepingTasks();
    const interval = setInterval(syncHousekeepingTasks, 3000);
    return () => clearInterval(interval);
  }, [syncHousekeepingTasks]);

  const syncGridRooms = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/rooms?tenantId=tenant-hoteisnet-demo`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.rooms) || data.rooms.length === 0) return;

      setRooms((prevRooms) => {
        const prevMap = new Map(prevRooms.map((r) => [r.number, r]));

        const updatedList: RoomDefinition[] = data.rooms.map((r: any) => {
          const roomNum = String(r.number);
          const existing = prevMap.get(roomNum);
          const isMaint = r.status === "MAINTENANCE";
          const catName = r.category || r.room_categories?.name || "Standard";
          const rate = r.ratePerNight || 180;

          if (existing) {
            if (
              existing.isMaintenance === isMaint &&
              existing.category === catName &&
              existing.ratePerNight === rate
            ) {
              return existing;
            }
            return {
              ...existing,
              category: catName,
              ratePerNight: rate,
              isMaintenance: isMaint,
            };
          }

          return {
            id: r.id,
            number: roomNum,
            category: catName,
            ratePerNight: rate,
            isMaintenance: isMaint,
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[ReservationGridMap] Erro ao sincronizar quartos do banco:", err);
    }
  }, []);

  useEffect(() => {
    syncGridRooms();
    const interval = setInterval(syncGridRooms, 3000);
    return () => clearInterval(interval);
  }, [syncGridRooms]);
  
  // Date Calculation
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

  // Date Focus: Current view focused on today
  const [viewYear, setViewYear] = useState<number>(todayYear);
  const [viewMonth, setViewMonth] = useState<number>(todayMonth);
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("month");
  
  // Date Jump & Grid Scroll References
  const [targetDateInput, setTargetDateInput] = useState<string>(todayStr);
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [hideOlderThan3Days, setHideOlderThan3Days] = useState<boolean>(true);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const dayColumnRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Helper: Normalize API reservation row to ReservationItem format
  const normalizeApiReservation = useCallback((r: any): ReservationItem => {
    const checkInDate = (r.checkInDate || r.check_in_date || "").split("T")[0];
    const checkOutDate = (r.checkOutDate || r.check_out_date || "").split("T")[0];
    const mapEndDateRaw = (r.occupiedUntilDate || r.mapEndDate || "").split("T")[0];

    // Extract room number
    let roomNum = "101";
    if (r.rooms && r.rooms.number) {
      roomNum = String(r.rooms.number);
    } else if (r.roomId && /^\d+$/.test(String(r.roomId))) {
      roomNum = String(r.roomId);
    } else {
      const allText = `${r.roomDescription || ""} ${r.notes || ""} ${r.tariffName || ""}`;
      const match = allText.match(/\d+/);
      if (match) {
        roomNum = match[0];
      } else if (r.roomId && String(r.roomId).match(/\d+/)) {
        roomNum = String(r.roomId).match(/\d+/)![0];
      } else if (r.roomId) {
        roomNum = String(r.roomId);
      }
    }

    let status = r.status || "CONFIRMED";
    if (["CHECKEDIN", "CHECK_IN", "OCCUPIED", "IN_PROGRESS"].includes(String(status).toUpperCase())) {
      status = "CHECKED_IN";
    }

    return {
      id: r.id || `RES-${Math.random()}`,
      roomId: String(roomNum),
      guestName: (r.guestName || r.guest_name || "HÓSPEDE").toUpperCase(),
      cpf: r.guestCpf || r.cpf || "",
      phone: r.guestPhone || r.phone || "",
      checkInDate: checkInDate,
      checkInTime: r.checkInTime || "14:00",
      checkOutDate: checkOutDate,
      mapEndDate: mapEndDateRaw && mapEndDateRaw > checkOutDate ? mapEndDateRaw : undefined,
      checkOutTime: r.checkOutTime || "12:00",
      dailyRate: parseFloat(r.dailyRate || r.daily_rate || 0),
      depositPaid: parseFloat(r.depositPaid || r.deposit_paid || 0),
      totalAmount: parseFloat(r.totalAmount || r.total_amount || 0),
      status: status as any,
      company: r.tariffName || r.company || undefined,
      notes: r.notes || undefined,
      precheckinSent: r.preCheckinSent || false,
      fnrhCompleted: r.fnrhCompleted || false,
    };
  }, []);

  // Sync with API reservations and ensure active checked-in stays (e.g. Quarto 102) are preserved
  useEffect(() => {
    let apiMapped: ReservationItem[] = [];
    if (Array.isArray(apiReservations) && apiReservations.length > 0) {
      apiMapped = apiReservations.map(normalizeApiReservation);
    }

    const combinedMap = new Map<string, ReservationItem>();

    // Override or add API reservations
    apiMapped.forEach(item => combinedMap.set(item.id, item));

    setReservations(Array.from(combinedMap.values()));
  }, [apiReservations, normalizeApiReservation]);

  // Selection & Interactivity
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  // Modals & Menu Actions
  const [showLancarModal, setShowLancarModal] = useState<boolean>(false);
  const [modalRoomNumber, setModalRoomNumber] = useState<string | undefined>(undefined);
  const [modalCheckInDate, setModalCheckInDate] = useState<string | undefined>(undefined);
  const [modalCheckOutDate, setModalCheckOutDate] = useState<string | undefined>(undefined);
  const [activeEditReservationData, setActiveEditReservationData] = useState<any | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showVisualizarModal, setShowVisualizarModal] = useState<boolean>(false);
  const [visualizeReservationData, setVisualizeReservationData] = useState<ReservationItem | null>(null);

  // Mouse Click & Drag Range Selection State
  const [isSelectingRange, setIsSelectingRange] = useState<boolean>(false);
  const [selectionRoomId, setSelectionRoomId] = useState<string | null>(null);
  const [selectionStartDate, setSelectionStartDate] = useState<string | null>(null);
  const [selectionEndDate, setSelectionEndDate] = useState<string | null>(null);

  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    reservation?: ReservationItem;
    roomId?: string;
    dateStr?: string;
  } | null>(null);

  // Close context menu on click anywhere
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  // Action Handler: Visualizar Reserva (Voucher)
  const handleOpenVisualizarModal = (res?: ReservationItem | null) => {
    const target = res || reservations.find(r => r.id === selectedReservationId);
    if (!target) {
      toast.info("Selecione uma reserva no mapa para visualizar o voucher.");
      return;
    }
    setVisualizeReservationData(target);
    setShowVisualizarModal(true);
  };

  // Action Handler: Editar Reserva
  const handleOpenEditarModal = (res?: ReservationItem | null) => {
    const target = res || reservations.find(r => r.id === selectedReservationId);
    if (!target) {
      toast.info("Selecione uma reserva no mapa para editar.");
      return;
    }
    if (target.status === "CHECKED_IN") {
      toast.info(`ℹ️ HOSPEDAGEM EM VIGÊNCIA (${target.guestName}): Esta hospedagem está com check-in efetivado e serve apenas para consulta informativa no mapa.`);
      return;
    }
    setSelectedReservationId(target.id);
    setModalRoomNumber(target.roomId);
    setModalCheckInDate(target.checkInDate);
    setActiveEditReservationData(target);
    setShowLancarModal(true);
  };

  // Action Handler: Excluir Reserva
  const handleOpenExcluirModal = (res?: ReservationItem | null) => {
    const target = res || reservations.find(r => r.id === selectedReservationId);
    if (!target) {
      toast.info("Selecione uma reserva no mapa para excluir.");
      return;
    }
    if (target.status === "CHECKED_IN") {
      toast.warning(`⚠️ HOSPEDAGEM EM VIGÊNCIA (${target.guestName}): Hospedagens ativas não podem ser excluídas pelo mapa de reserva.`);
      return;
    }
    setSelectedReservationId(target.id);
    setShowDeleteModal(true);
  };

  // Action Handler: Enviar Voucher pelo WhatsApp (Atalho Direto)
  const handleQuickSendWhatsApp = async (res?: ReservationItem | null) => {
    const target = res || reservations.find(r => r.id === selectedReservationId);
    if (!target) {
      toast.info("Selecione uma reserva no mapa para enviar o voucher por WhatsApp.");
      return;
    }
    if (!target.phone) {
      toast.warning("A reserva não possui um telefone/WhatsApp cadastrado.");
      return;
    }

    toast.info(`Processando voucher de ${target.guestName} para envio...`);
    try {
      const pdfData = {
        hotelName: "HOTEL IDEAL",
        hotelCnpj: "40.904.811/0001-31",
        hotelAddress: "RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614",
        reservationNumber: target.id || "RES-001",
        issueDate: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR").slice(0, 5),
        roomNumber: target.roomId || "101",
        roomCategory: "STANDARD SUPERIOR",
        roomDescription: `Quarto ${target.roomId}`,
        roomFloor: "1º ANDAR",
        tariffName: target.company || "TARIFA PADRÃO",
        adults: 1,
        children: 0,
        guestName: target.guestName || "HÓSPEDE",
        guestCpf: target.cpf || "-",
        guestPhone: target.phone || "-",
        checkInDate: `${formatDateBr(target.checkInDate)} ${target.checkInTime || defaultCheckInTime || "14:00"}:00`,
        checkOutDate: `${formatDateBr(target.checkOutDate)} ${target.checkOutTime || defaultCheckOutTime || "12:00"}:00`,
        dailyRows: [
          {
            dtReserva: formatDateBr(target.checkInDate),
            dtFinal: formatDateBr(target.checkOutDate),
            diaria: target.dailyRate || 0,
          },
        ],
        totals: {
          totalDiarias: target.totalAmount || 0,
          totalAdiantamento: target.depositPaid || 0,
          desconto: 0,
          totalLiquido: Math.max(0, (target.totalAmount || 0) - (target.depositPaid || 0)),
        },
        payments: target.depositPaid ? [{ paymentDate: formatDateBr(target.checkInDate), amount: target.depositPaid, paymentMethod: "ADIANTAMENTO RESERVA" }] : [],
        notes: target.notes || "",
      };

      const pdfBase64 = generateReservaPdfBase64(pdfData);
      const captionMsg = `Olá, *${target.guestName}*!\nSegue em anexo a confirmação da sua reserva no *Hotel* (Reserva ${target.id}).\n\n📌 *Quarto:* ${target.roomId}\n📅 *Período:* ${formatDateBr(target.checkInDate)} a ${formatDateBr(target.checkOutDate)}\n💰 *Valor Total:* R$ ${(target.totalAmount || 0).toFixed(2)}`;

      const response = await fetch("/api/uazapi/send-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: target.phone,
          guestName: target.guestName,
          caption: captionMsg,
          pdfBase64: pdfBase64,
          filename: `Voucher_Reserva_${target.id}.pdf`,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`✓ Voucher da Reserva ${target.id} enviado com sucesso via WhatsApp para ${target.phone}!`);
      } else {
        const cleanPhone = target.phone.replace(/\D/g, "");
        const targetPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(captionMsg)}`, "_blank");
        toast.info("Abrindo conversa no WhatsApp Web com o voucher.");
      }
    } catch (err) {
      const cleanPhone = target.phone.replace(/\D/g, "");
      const targetPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const captionMsg = `Olá, *${target.guestName}*!\nSegue a confirmação da sua reserva no *Hotel* (Reserva ${target.id}).`;
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(captionMsg)}`, "_blank");
    }
  };

  // Action Handler: Enviar Link de Pré-Check-in (FNRH) pelo WhatsApp
  const [sendingPreCheckinId, setSendingPreCheckinId] = useState<string | null>(null);
  const handleSendPreCheckinLink = async (res?: ReservationItem | null) => {
    const target = res || reservations.find(r => r.id === selectedReservationId);
    if (!target) {
      toast.info("Selecione uma reserva no mapa para enviar o link de pré-check-in.");
      return;
    }
    if (!target.phone) {
      toast.warning("A reserva não possui um telefone/WhatsApp cadastrado.");
      return;
    }

    setSendingPreCheckinId(target.id);
    try {
      const response = await fetch("/api/uazapi/send-precheckin-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: target.id }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`✓ Link de pré-check-in de ${target.guestName} enviado com sucesso via WhatsApp!`);
        setReservations(prev => prev.map(r => (r.id === target.id ? { ...r, precheckinSent: true } : r)));
      } else {
        toast.warning(data.error || "Não foi possível enviar o link de pré-check-in.");
      }
    } catch (err) {
      toast.warning("Erro de conexão ao enviar o link de pré-check-in.");
    } finally {
      setSendingPreCheckinId(null);
    }
  };

  // Modal Form Fields
  const [formRoomId, setFormRoomId] = useState<string>("101");
  const [formGuestName, setFormGuestName] = useState<string>("");
  const [formCpf, setFormCpf] = useState<string>("");
  const [formPhone, setFormPhone] = useState<string>("");
  const [formCheckInDate, setFormCheckInDate] = useState<string>("2026-08-12");
  const [formCheckInTime, setFormCheckInTime] = useState<string>(defaultCheckInTime || "14:00");
  const [formCheckOutDate, setFormCheckOutDate] = useState<string>("2026-08-15");
  const [formCheckOutTime, setFormCheckOutTime] = useState<string>(defaultCheckOutTime || "12:00");
  const [formDailyRate, setFormDailyRate] = useState<number>(350);
  const [formDepositPaid, setFormDepositPaid] = useState<number>(350);
  const [formCompany, setFormCompany] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [editingResId, setEditingResId] = useState<string | null>(null);

  // Drag & Drop State
  const [draggedResId, setDraggedResId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ roomId: string; dateStr: string } | null>(null);

  // Scroll directly to a target date column inside the grid
  const scrollToDate = (dateStr: string) => {
    const el = dayColumnRefs.current[dateStr];
    if (el && gridContainerRef.current) {
      const container = gridContainerRef.current;
      const elLeft = el.offsetLeft;
      const targetScroll = Math.max(0, elLeft - 120);
      container.scrollTo({ left: targetScroll, behavior: "smooth" });

      setHighlightedDate(dateStr);
      setTimeout(() => {
        setHighlightedDate(null);
      }, 3000);
    }
  };

  // Jump to specific date (ex: 19/08/2026)
  const handleJumpToDate = (dateVal: string) => {
    if (!dateVal) return;
    setTargetDateInput(dateVal);
    const parts = dateVal.split("-");
    if (parts.length !== 3) return;

    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;

    if (!isNaN(y) && !isNaN(m)) {
      setViewYear(y);
      setViewMonth(m);

      setTimeout(() => {
        scrollToDate(dateVal);
      }, 150);
    }
  };

  // Scroll grid horizontally by +/- N days
  const scrollGridByDays = (daysCount: number) => {
    if (gridContainerRef.current) {
      const colWidth = 75; // px per day cell
      gridContainerRef.current.scrollBy({ left: daysCount * colWidth, behavior: "smooth" });
    }
  };

  // Date threshold: 3 days before current date
  const threeDaysAgoObj = new Date(todayYear, todayMonth, todayDay - 3);
  threeDaysAgoObj.setHours(0, 0, 0, 0);

  // Generate Days of the Current Month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthDaysAll = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateObj = new Date(viewYear, viewMonth, dayNum);
    dateObj.setHours(0, 0, 0, 0);
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isToday = dateStr === todayStr;
    
    const weekDayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const label = `${weekDayNames[dayOfWeek]} ${String(dayNum).padStart(2, "0")}`;

    return { dayNum, dateStr, dayOfWeek, isWeekend, isToday, label, dateObj };
  });

  // Filter out days older than 3 days ago when hideOlderThan3Days is enabled
  const monthDays = monthDaysAll.filter((d) => {
    if (!hideOlderThan3Days) return true;
    return d.dateObj >= threeDaysAgoObj;
  });

  // Keydown listener for DELETE / BACKSPACE key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input or textarea
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedReservationId) {
        const target = reservations.find(r => r.id === selectedReservationId);
        if (target?.status === "CHECKED_IN") {
          e.preventDefault();
          toast.warning(`⚠️ HOSPEDAGEM EM VIGÊNCIA (${target.guestName}): Hospedagens com check-in efetivado não podem ser excluídas pelo mapa de reserva.`);
          return;
        }
        e.preventDefault();
        setShowDeleteModal(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedReservationId, reservations, toast]);

  // Helper: Format Date String to BR format (DD/MM/YYYY)
  const formatDateBr = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Helper: Add 1 day to a YYYY-MM-DD string using UTC math (avoids timezone drift from new Date(dateStr))
  const addOneDayStr = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const yy = next.getUTCFullYear();
    const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(next.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  // RIGID CONFLICT CONTROL: Check timestamp overlap
  const checkReservationConflict = (
    targetRoomId: string,
    checkInDateStr: string,
    checkInTimeStr: string,
    checkOutDateStr: string,
    checkOutTimeStr: string,
    excludeResId?: string
  ): { hasConflict: boolean; reason?: string } => {
    const effectiveInTime = checkInTimeStr || defaultCheckInTime || "14:00";
    const effectiveOutTime = checkOutTimeStr || defaultCheckOutTime || "12:00";

    const newStart = new Date(`${checkInDateStr}T${effectiveInTime}:00`).getTime();
    const newEnd = new Date(`${checkOutDateStr}T${effectiveOutTime}:00`).getTime();

    if (isNaN(newStart) || isNaN(newEnd)) {
      return { hasConflict: true, reason: "Datas ou horários de entrada/saída inválidos." };
    }

    if (newEnd <= newStart) {
      return { hasConflict: true, reason: "A data/hora de checkout deve ser posterior ao checkin." };
    }

    // 1. Check Maintenance
    const roomDef = rooms.find(r => r.id === targetRoomId || r.number === targetRoomId);
    if (roomDef?.isMaintenance) {
      return { hasConflict: true, reason: `O Quarto ${targetRoomId} está em MANUTENÇÃO/BLOQUEADO e não aceita reservas.` };
    }

    // 2. Check Overlap against existing reservations
    for (const res of reservations) {
      if (res.id === excludeResId) continue;
      if (res.roomId !== targetRoomId && res.roomId !== roomDef?.number && res.roomId !== roomDef?.id) continue;
      if (res.status === "CANCELLED" || res.status === "CHECKED_OUT") continue;

      const resInTime = res.checkInTime || defaultCheckInTime || "14:00";
      const resOutTime = res.checkOutTime || defaultCheckOutTime || "12:00";

      const existingStart = new Date(`${res.checkInDate}T${resInTime}:00`).getTime();
      const existingEnd = new Date(`${res.checkOutDate}T${resOutTime}:00`).getTime();

      // Timestamp Overlap condition: startA < endB AND endA > startB
      if (newStart < existingEnd && newEnd > existingStart) {
        return {
          hasConflict: true,
          reason: `⚠️ CONFLITO DE RESERVA BLOQUEADO!\n\nO Quarto ${targetRoomId} já possui a reserva "${res.guestName}" no período de ${formatDateBr(res.checkInDate)} às ${resInTime} até ${formatDateBr(res.checkOutDate)} às ${resOutTime}.\n\nPara evitar reservas duplicadas, selecione outra acomodação ou ajuste os horários.`
        };
      }
    }

    return { hasConflict: false };
  };

  // Helper: Verify if a date range for a specific room is available (free of reservations and maintenance)
  const isDateRangeAvailable = useCallback((
    targetRoomId: string,
    startStr: string,
    endStr: string
  ): { isAvailable: boolean; conflictReason?: string } => {
    if (!targetRoomId || !startStr || !endStr) return { isAvailable: false };

    const [minDateStr, maxDateStr] = startStr <= endStr ? [startStr, endStr] : [endStr, startStr];

    let checkOutStr = maxDateStr;
    if (minDateStr === maxDateStr) {
      checkOutStr = addOneDayStr(minDateStr);
    }

    const inTime = defaultCheckInTime || "14:00";
    const outTime = defaultCheckOutTime || "12:00";

    const conflict = checkReservationConflict(
      targetRoomId,
      minDateStr,
      inTime,
      checkOutStr,
      outTime
    );

    return {
      isAvailable: !conflict.hasConflict,
      conflictReason: conflict.reason,
    };
  }, [rooms, reservations, defaultCheckInTime, defaultCheckOutTime]);

  // Click & Drag Range Handlers
  const handleCellMouseDown = (e: React.MouseEvent, roomId: string, dateStr: string) => {
    if (e.button !== 0) return; // Only left click

    if (dateStr < todayStr) {
      toast.error(`⚠️ Não é permitido abrir reservas para datas passadas (anteriores a hoje ${formatDateBr(todayStr)}).`);
      return;
    }

    const roomDef = rooms.find(r => r.id === roomId || r.number === roomId);
    if (roomDef?.isMaintenance) {
      toast.error(`⚠️ O Quarto ${roomId} está em MANUTENÇÃO e não aceita reservas.`);
      return;
    }

    setIsSelectingRange(true);
    setSelectionRoomId(roomId);
    setSelectionStartDate(dateStr);
    setSelectionEndDate(dateStr);
  };

  const handleCellMouseEnter = (roomId: string, dateStr: string) => {
    if (isSelectingRange && selectionRoomId === roomId) {
      setSelectionEndDate(dateStr);
    }
  };

  const handleGlobalMouseUp = useCallback(() => {
    if (!isSelectingRange) return;

    if (selectionRoomId && selectionStartDate && selectionEndDate) {
      const [minDateStr, maxDateStr] = selectionStartDate <= selectionEndDate
        ? [selectionStartDate, selectionEndDate]
        : [selectionEndDate, selectionStartDate];

      let checkInStr = minDateStr;
      let checkOutStr = maxDateStr;

      if (minDateStr === maxDateStr) {
        checkOutStr = addOneDayStr(minDateStr);
      }

      if (checkInStr < todayStr) {
        toast.error(`⚠️ Não é permitido abrir reservas para datas passadas (anteriores a hoje ${formatDateBr(todayStr)}).`);
        setIsSelectingRange(false);
        setSelectionRoomId(null);
        setSelectionStartDate(null);
        setSelectionEndDate(null);
        return;
      }

      const checkResult = isDateRangeAvailable(selectionRoomId, checkInStr, checkOutStr);

      if (checkResult.isAvailable) {
        const targetRoomDef = rooms.find(r => r.id === selectionRoomId || r.number === selectionRoomId);
        const roomNumToUse = targetRoomDef ? targetRoomDef.number : selectionRoomId;

        setSelectedReservationId(null);
        setModalRoomNumber(roomNumToUse);
        setModalCheckInDate(checkInStr);
        setModalCheckOutDate(checkOutStr);
        setActiveEditReservationData(null);
        setShowLancarModal(true);

        toast.success(`✓ Período selecionado no Quarto ${roomNumToUse}: ${formatDateBr(checkInStr)} a ${formatDateBr(checkOutStr)}.`);
      } else {
        toast.error(checkResult.conflictReason || "⚠️ Seleção bloqueada: O período selecionado contém datas já reservadas ou bloqueadas.");
      }
    }

    setIsSelectingRange(false);
    setSelectionRoomId(null);
    setSelectionStartDate(null);
    setSelectionEndDate(null);
  }, [isSelectingRange, selectionRoomId, selectionStartDate, selectionEndDate, isDateRangeAvailable, rooms, toast, formatDateBr, todayStr]);

  useEffect(() => {
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [handleGlobalMouseUp]);

  // Action: Open New Reservation modal on cell double click
  const handleCellDoubleClick = (roomId: string, dateStr: string) => {
    if (dateStr < todayStr) {
      toast.error(`⚠️ Não é permitido abrir reservas para datas passadas (anteriores a hoje ${formatDateBr(todayStr)}).`);
      return;
    }

    const roomDef = rooms.find(r => r.id === roomId || r.number === roomId);
    if (roomDef?.isMaintenance) {
      toast.error(`⚠️ O Quarto ${roomId} está em MANUTENÇÃO e não aceita reservas.`);
      return;
    }

    setSelectedReservationId(null);
    setModalRoomNumber(roomId);
    setModalCheckInDate(dateStr);
    setActiveEditReservationData(null);
    setShowLancarModal(true);
  };

  // Action: Open Edit Modal on reservation double click (Bloqueado para Hospedagem em vigência)
  const handleReservationDoubleClick = (res: ReservationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (res.status === "CHECKED_IN") {
      toast.info(`ℹ️ HOSPEDAGEM EM VIGÊNCIA (${res.guestName}): Esta hospedagem está com check-in efetivado e serve apenas para consulta informativa no mapa.`);
      return;
    }
    setSelectedReservationId(res.id);
    setModalRoomNumber(res.roomId);
    setModalCheckInDate(res.checkInDate);
    setActiveEditReservationData(res);
    setShowLancarModal(true);
  };



  // Action: Delete Selected Reservation
  // Aguarda a confirmação do backend antes de remover da tela / mostrar sucesso — evitar que o
  // operador veja "excluída com sucesso" enquanto a reserva continua ativa no banco (ex.: recusa
  // por falta de permissão de admin, exigida pela rota DELETE).
  const handleConfirmDelete = async () => {
    if (!selectedReservationId) return;

    const target = reservations.find(r => r.id === selectedReservationId);
    if (target?.status === "CHECKED_IN") {
      toast.warning(`⚠️ HOSPEDAGEM EM VIGÊNCIA (${target.guestName}): Hospedagens ativas não podem ser excluídas pelo mapa de reserva.`);
      setShowDeleteModal(false);
      return;
    }

    const resIdToDelete = selectedReservationId;
    setShowDeleteModal(false);

    try {
      const r = await fetch(`/api/reservations?id=${encodeURIComponent(resIdToDelete)}&tenantId=TNT-01`, {
        method: "DELETE",
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        throw new Error(data?.error || `HTTP ${r.status}`);
      }
      setReservations(prev => prev.filter(res => res.id !== resIdToDelete));
      setSelectedReservationId(null);
      toast.success(`Reserva de ${target ? target.guestName : "Hóspede"} foi excluída com sucesso.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Erro na API ao excluir reserva:", err);
      toast.error(`Não foi possível excluir a reserva${target ? ` de ${target.guestName}` : ""}. Tente novamente.`);
    }
  };

  // Drag & Drop Handlers (Bloqueado para Hospedagem em vigência)
  const handleDragStart = (e: React.DragEvent, res: ReservationItem) => {
    e.stopPropagation();
    if (res.status === "CHECKED_IN") {
      e.preventDefault();
      toast.warning(`⚠️ HOSPEDAGEM EM VIGÊNCIA (${res.guestName}): Hospedagens ativas não podem ser movidas no mapa de reserva.`);
      return;
    }
    setDraggedResId(res.id);
    setSelectedReservationId(res.id);
    e.dataTransfer.setData("text/plain", res.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, roomId: string, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell({ roomId, dateStr });
  };

  const handleDragEnd = () => {
    setDraggedResId(null);
    setDragOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, targetRoomId: string, targetDateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCell(null);

    const dropId = draggedResId || e.dataTransfer.getData("text/plain");
    if (!dropId) return;

    const res = reservations.find(r => r.id === dropId);
    if (!res) return;

    // Bloquear movimentação para datas anteriores à data atual (hoje)
    if (targetDateStr < todayStr) {
      setDraggedResId(null);
      toast.error(`⚠️ MOVIMENTAÇÃO BLOQUEADA: Não é permitido mover reservas para datas passadas (anteriores a hoje ${formatDateBr(todayStr)}).`);
      return;
    }

    const inTime = res.checkInTime || defaultCheckInTime || "14:00";
    const outTime = res.checkOutTime || defaultCheckOutTime || "12:00";

    // Calculate stay duration in milliseconds
    const oldStartMs = new Date(`${res.checkInDate}T${inTime}:00`).getTime();
    const oldEndMs = new Date(`${res.checkOutDate}T${outTime}:00`).getTime();
    const durationMs = Math.max(86400000, oldEndMs - oldStartMs);

    // New check-in start
    const newStartDateTimeStr = `${targetDateStr}T${inTime}:00`;
    const newStartMs = new Date(newStartDateTimeStr).getTime();
    const newEndMs = newStartMs + durationMs;
    const newEndDateObj = new Date(newEndMs);

    const newEndYear = newEndDateObj.getFullYear();
    const newEndMonth = String(newEndDateObj.getMonth() + 1).padStart(2, "0");
    const newEndDay = String(newEndDateObj.getDate()).padStart(2, "0");
    const newCheckOutDateStr = `${newEndYear}-${newEndMonth}-${newEndDay}`;

    // Perform rigid conflict check
    const conflict = checkReservationConflict(
      targetRoomId,
      targetDateStr,
      inTime,
      newCheckOutDateStr,
      outTime,
      res.id
    );

    if (conflict.hasConflict) {
      setDraggedResId(null);
      toast.error(conflict.reason || "MOVIMENTAÇÃO BLOQUEADA (CONFLITO DE RESERVA)");
      return;
    }

    // Apply move in local state immediately
    setReservations(prev => prev.map(r => {
      if (r.id === draggedResId) {
        return {
          ...r,
          roomId: targetRoomId,
          checkInDate: targetDateStr,
          checkOutDate: newCheckOutDateStr
        };
      }
      return r;
    }));

    setDraggedResId(null);
    toast.success(`✓ Reserva de ${res.guestName} movida para Quarto ${targetRoomId} (${formatDateBr(targetDateStr)} a ${formatDateBr(newCheckOutDateStr)})!`);

    // PERSISTIR ALTERAÇÃO NO BANCO DE DADOS POSTGRESQL / SUPABASE VIA PATCH
    fetch("/api/reservations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: res.id,
        roomId: targetRoomId,
        checkInDate: targetDateStr,
        checkOutDate: newCheckOutDateStr,
        guestName: res.guestName,
        guestCpf: res.cpf,
        guestPhone: res.phone,
        dailyRate: res.dailyRate,
        depositPaid: res.depositPaid,
        totalAmount: res.totalAmount,
        status: res.status,
        notes: res.notes,
        tenantId: "TNT-01",
      }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (data.success) {
          console.log("[DragAndDrop] Movimentação salva com sucesso no banco de dados.");
          if (onRefresh) onRefresh();
        } else {
          console.error("[DragAndDrop] Erro ao salvar movimentação no banco:", data.error);
        }
      })
      .catch((err) => console.error("[DragAndDrop] Erro na requisição PATCH:", err));
  };



  // Period navigation helpers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
    setTargetDateInput(todayStr);
    setTimeout(() => {
      scrollToDate(todayStr);
    }, 100);
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <div className="space-y-4 select-none">

      {/* MENU DE FUNÇÕES DO MAPA DE RESERVA */}
      <div className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-lg ${
        theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200"
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#0284C7] bg-[#0284C7]/10 px-2.5 py-1 rounded-lg border border-[#0284C7]/20 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5" /> Menu do Mapa
          </span>

          {selectedReservationId ? (
            <span className="text-xs font-mono font-semibold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-2">
              <span>Selecionada:</span>
              <strong className="text-[#0284C7] max-w-[200px] truncate">
                {reservations.find(r => r.id === selectedReservationId)?.guestName || selectedReservationId}
              </strong>
              <button
                onClick={() => setSelectedReservationId(null)}
                className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Desmarcar Seleção (Limpar)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-slate-400 hidden md:inline">
              Selecione uma reserva no mapa para habilitar as ações
            </span>
          )}
        </div>

        {/* BOTOES DE ACAO DO MENU */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. INCLUIR RESERVA */}
          <button
            onClick={() => {
              setModalRoomNumber("101");
              setModalCheckInDate(todayStr);
              setActiveEditReservationData(null);
              setShowLancarModal(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#0284C7]/20 transition-all"
            title="Lançar Nova Reserva"
          >
            <Plus className="w-4 h-4" />
            Incluir Reserva
          </button>

          {/* 2. EDITAR RESERVA */}
          <button
            onClick={() => handleOpenEditarModal()}
            disabled={!selectedReservationId}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              selectedReservationId
                ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700 shadow-sm"
                : "bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
            title="Editar dados da reserva selecionada"
          >
            <Edit3 className="w-4 h-4 text-amber-400" />
            Editar Reserva
          </button>

          {/* 3. VISUALIZAR RESERVA / VOUCHER */}
          <button
            onClick={() => handleOpenVisualizarModal()}
            disabled={!selectedReservationId}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              selectedReservationId
                ? "bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700 shadow-sm"
                : "bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
            title="Visualizar Voucher de Reserva (Imprimir, E-mail, WhatsApp)"
          >
            <Eye className="w-4 h-4 text-sky-400" />
            Visualizar Reserva
          </button>

          {/* 4. ENVIAR VOUCHER WHATSAPP */}
          <button
            onClick={() => handleQuickSendWhatsApp()}
            disabled={!selectedReservationId}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              selectedReservationId
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md shadow-emerald-600/20"
                : "bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
            title="Enviar Voucher por WhatsApp para o hóspede"
          >
            <MessageSquare className="w-4 h-4" />
            Enviar Voucher WhatsApp
          </button>

          {/* 5. ENVIAR LINK PRÉ-CHECK-IN (FNRH) */}
          <button
            onClick={() => handleSendPreCheckinLink()}
            disabled={!selectedReservationId || sendingPreCheckinId === selectedReservationId}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              selectedReservationId
                ? "bg-teal-600 hover:bg-teal-700 text-white border-teal-500 shadow-md shadow-teal-600/20"
                : "bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
            title="Enviar link de pré-check-in (FNRH) por WhatsApp para o hóspede"
          >
            <PhoneCall className="w-4 h-4" />
            {sendingPreCheckinId === selectedReservationId
              ? "Enviando..."
              : reservations.find(r => r.id === selectedReservationId)?.precheckinSent
              ? "Reenviar Pré-Check-in"
              : "Enviar Pré-Check-in"}
          </button>

          {/* 6. EXCLUIR RESERVA */}
          <button
            onClick={() => handleOpenExcluirModal()}
            disabled={!selectedReservationId}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              selectedReservationId
                ? "bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800 shadow-sm"
                : "bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed"
            }`}
            title="Excluir reserva selecionada"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            Excluir Reserva
          </button>
        </div>
      </div>

      {/* TOP HEADER CONTROLS */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 shadow-xl ${
        theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Navigation & Month Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className={`p-2 rounded-lg transition-colors ${
                theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              title="Mês Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNextMonth}
              className={`p-2 rounded-lg transition-colors ${
                theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              title="Próximo Mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div>
            <h1 className={`text-xl font-bold tracking-tight flex items-center gap-2 ${
              theme.isDark ? "text-white" : "text-slate-900"
            }`}>
              {monthNames[viewMonth]} {viewYear}
            </h1>
            <span className={`text-xs ${theme.isDark ? "text-slate-400" : "text-slate-500"}`}>
              Mapa de reserva dos quartos -
            </span>
          </div>
        </div>

        {/* Date Jump ("Ir para Data") & Days Scroll Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor "Ir para Data" */}
          <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 text-xs ${
            theme.isDark ? "bg-[#1E293B] border-slate-700" : "bg-slate-100 border-slate-200"
          }`}>
            <CalendarIcon className="w-4 h-4 text-[#0284C7]" />
            <span className={`font-semibold hidden sm:inline ${theme.isDark ? "text-slate-300" : "text-slate-700"}`}>
              Ir para Data:
            </span>
            <input
              type="date"
              value={targetDateInput}
              onChange={(e) => handleJumpToDate(e.target.value)}
              className={`bg-transparent font-mono outline-none border-none text-xs cursor-pointer ${
                theme.isDark ? "text-white" : "text-slate-900"
              }`}
            />
          </div>

          {/* Toggle Filtro -3 Dias */}
          <button
            onClick={() => setHideOlderThan3Days(!hideOlderThan3Days)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              hideOlderThan3Days
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                : theme.isDark ? "bg-[#1E293B] text-slate-400 border-slate-700 hover:text-slate-200" : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
            title={hideOlderThan3Days ? "Filtro Ativo: Exibindo apenas a partir de 3 dias antes da data atual (Clique para ver mês completo)" : "Exibindo mês completo (Clique para ocultar datas anteriores a 3 dias atrás)"}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            {hideOlderThan3Days ? "-3 dias ativado" : "Mês completo"}
          </button>

          {/* Quick Scroll Days: -7d / +7d */}
          <div className={`flex items-center rounded-xl border p-1 ${
            theme.isDark ? "bg-[#1E293B] border-slate-700" : "bg-slate-100 border-slate-200"
          }`}>
            <button
              onClick={() => scrollGridByDays(-7)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                theme.isDark ? "text-slate-300 hover:text-white hover:bg-slate-700/60" : "text-slate-700 hover:bg-slate-200"
              }`}
              title="Voltar 7 dias no grid"
            >
              <ChevronLeft className="w-4 h-4 text-[#0284C7]" /> -7d
            </button>
            <button
              onClick={() => scrollGridByDays(7)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all ${
                theme.isDark ? "text-slate-300 hover:text-white hover:bg-slate-700/60" : "text-slate-700 hover:bg-slate-200"
              }`}
              title="Avançar 7 dias no grid"
            >
              +7d <ChevronRight className="w-4 h-4 text-[#0284C7]" />
            </button>
          </div>

          {/* View Mode & Today Button */}
          <div className={`flex items-center rounded-xl border p-1 ${
            theme.isDark ? "bg-[#1E293B] border-slate-700" : "bg-slate-100 border-slate-200"
          }`}>
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "day"
                  ? "bg-[#0284C7] text-white shadow-md"
                  : theme.isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "week"
                  ? "bg-[#0284C7] text-white shadow-md"
                  : theme.isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "month"
                  ? "bg-[#0284C7] text-white shadow-md"
                  : theme.isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Mês
            </button>
            <button
              onClick={handleToday}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#0284C7] hover:bg-[#0369A1] text-white transition-colors ml-1 shadow-md shadow-[#0284C7]/20"
            >
              Hoje
            </button>
          </div>
        </div>
      </div>

      {/* QUICK INSTRUCTION HINT BAR */}
      <div className={`px-4 py-2.5 rounded-xl border text-[11px] flex flex-wrap items-center justify-between gap-2 shadow-sm ${
        theme.isDark ? "bg-slate-900/90 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
      }`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]"></span>
            <span>Reserva (Azul)</span>
          </span>
          <span className="flex items-center gap-1.5 font-bold px-2 py-0.5 rounded bg-[#FEF08A] border border-amber-500 text-slate-950 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>Check-in em Curso (Amarelo Claro)</span>
          </span>
          <span className="flex items-center gap-1 text-[#0284C7] font-semibold">
            <Info className="w-3.5 h-3.5" /> Clique 2x célula: <strong>Nova Reserva</strong>
          </span>
          <span className="flex items-center gap-1 text-[#D97706] font-semibold">
            <Edit3 className="w-3.5 h-3.5" /> Clique 2x reserva: <strong>Alterar</strong>
          </span>
          <span className="flex items-center gap-1 text-rose-500 font-semibold">
            <Trash2 className="w-3.5 h-3.5" /> Delete reserva: <strong>Excluir</strong>
          </span>
          <span className="flex items-center gap-1 text-emerald-600 font-semibold">
            <ArrowRightLeft className="w-3.5 h-3.5" /> Arraste reserva: <strong>Mover</strong>
          </span>
        </div>
        <span className="text-[10px] font-bold text-amber-950 bg-amber-300 px-2 py-0.5 rounded border border-amber-500 shadow-sm">
          🟨 Check-in em Curso (Amarelo): Informativo puro (não editável pelo mapa)
        </span>
      </div>

      {/* GRID MATRIX CONTAINER WITH LATERAL OVERLAY SCROLL BUTTONS */}
      <div className="relative group">
        {/* Floating Lateral Scroll Buttons */}
        <button
          onClick={() => scrollGridByDays(-7)}
          className="absolute left-28 top-3 z-30 p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white shadow-2xl hover:bg-[#0284C7] hover:border-[#0284C7] transition-all opacity-80 group-hover:opacity-100"
          title="Rolar 7 dias para a esquerda"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => scrollGridByDays(7)}
          className="absolute right-3 top-3 z-30 p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-white shadow-2xl hover:bg-[#0284C7] hover:border-[#0284C7] transition-all opacity-80 group-hover:opacity-100"
          title="Rolar 7 dias para a direita"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div
          ref={gridContainerRef}
          className={`rounded-2xl border overflow-x-auto shadow-2xl relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 ${
            theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200"
          }`}
        >
          <div className="min-w-[1400px]">
            {/* HEADER ROW: DAYS OF MONTH */}
            <div className={`flex border-b sticky top-0 z-30 ${
              theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-slate-100 border-slate-200"
            }`}>
              {/* Corner Cell: Rooms Title */}
              <div className={`w-28 shrink-0 p-3 border-r-2 border-r-slate-700/80 font-bold text-xs text-center flex items-center justify-center sticky left-0 top-0 z-40 shadow-[4px_0_10px_rgba(0,0,0,0.5)] ${
                theme.isDark ? "bg-[#0F172A] border-b border-b-slate-800 text-white" : "bg-white border-b border-b-slate-200 text-slate-900"
              }`}>
                Apto / Dia
              </div>

              {/* Date Columns Header */}
              <div className="flex-1 flex">
                {monthDays.map((d) => {
                  const isTargetHighlighted = highlightedDate === d.dateStr;
                  return (
                    <div
                      key={d.dateStr}
                      ref={(el) => {
                        dayColumnRefs.current[d.dateStr] = el;
                      }}
                      className={`flex-1 min-w-[75px] py-1.5 px-1 text-center border-r text-[11px] font-mono transition-all relative ${
                        theme.isDark ? "border-slate-800" : "border-slate-200"
                      } ${
                        isTargetHighlighted
                          ? "bg-[#0284C7] text-white font-bold ring-4 ring-[#38BDF8] ring-inset animate-pulse scale-105"
                          : d.isToday
                          ? "bg-gradient-to-b from-[#0284C7] to-[#0369A1] text-white font-black ring-2 ring-amber-400 shadow-lg shadow-[#0284C7]/40 z-10"
                          : d.isWeekend
                          ? theme.isDark ? "bg-slate-800/80 text-slate-300 font-semibold" : "bg-slate-200 text-slate-800 font-semibold"
                          : theme.isDark ? "bg-[#0F172A] text-slate-300" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center">
                        {d.isToday && (
                          <span className="text-[9px] uppercase tracking-wider bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 rounded shadow-sm mb-0.5 animate-pulse flex items-center gap-0.5">
                            ★ HOJE
                          </span>
                        )}
                        <span>{d.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          {/* ROOM ROWS */}
          <div className={`divide-y ${theme.isDark ? "divide-slate-800/80" : "divide-slate-200"}`}>
            {rooms.map((room) => (
              <div key={room.id} className={`flex relative min-h-[70px] group transition-colors ${theme.isDark ? "hover:bg-slate-900/30" : "hover:bg-slate-50"}`}>
                {/* Left Column: Room Number */}
                <div className={`w-28 shrink-0 p-3 border-r-2 border-r-slate-700/80 flex flex-col items-center justify-center sticky left-0 z-20 shadow-[4px_0_10px_rgba(0,0,0,0.4)] ${
                  theme.isDark ? "bg-[#0F172A] text-white" : "bg-white text-slate-900"
                } ${
                  room.isMaintenance ? (theme.isDark ? "bg-rose-950/80" : "bg-rose-100") : ""
                }`}>
                  <span className={`text-base font-bold tracking-wide ${theme.isDark ? "text-white" : "text-slate-900"}`}>
                    {room.number}
                  </span>
                  <span className="text-[9px] opacity-60 truncate max-w-full">
                    {room.category.split(" ")[0]}
                  </span>
                  {room.isMaintenance && (
                    <span className="mt-0.5 px-1 py-0.5 rounded text-[8px] bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold">
                      Manutenção
                    </span>
                  )}
                  {housekeepingByRoomId[room.id] && (
                    <span className={`mt-0.5 px-1 py-0.5 rounded text-[8px] font-semibold border animate-pulse ${
                      housekeepingByRoomId[room.id].type === "OCCUPIED"
                        ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                        : "bg-amber-500/20 text-amber-500 border-amber-500/30"
                    }`}>
                      {housekeepingByRoomId[room.id].type === "OCCUPIED" ? "Arrumação c/ hóspede" : "Em limpeza"}
                    </span>
                  )}
                </div>

                {/* Day Cells Grid for this Room */}
                <div className="flex-1 flex relative">
                  {monthDays.map((d) => {
                    const isHoverTarget = dragOverCell?.roomId === room.id && dragOverCell?.dateStr === d.dateStr;

                    const isSelectedRangeCell = isSelectingRange &&
                      selectionRoomId === room.id &&
                      selectionStartDate !== null &&
                      selectionEndDate !== null &&
                      d.dateStr >= (selectionStartDate <= selectionEndDate ? selectionStartDate : selectionEndDate) &&
                      d.dateStr <= (selectionStartDate <= selectionEndDate ? selectionEndDate : selectionStartDate);

                    const minSelectedDate = selectionStartDate && selectionEndDate
                      ? (selectionStartDate <= selectionEndDate ? selectionStartDate : selectionEndDate)
                      : null;
                    const maxSelectedDate = selectionStartDate && selectionEndDate
                      ? (selectionStartDate <= selectionEndDate ? selectionEndDate : selectionStartDate)
                      : null;

                    const rangeAvailability = isSelectedRangeCell && minSelectedDate && maxSelectedDate
                      ? isDateRangeAvailable(room.id, minSelectedDate, maxSelectedDate)
                      : { isAvailable: true };

                    return (
                      <div
                        key={d.dateStr}
                        onMouseDown={(e) => handleCellMouseDown(e, room.id, d.dateStr)}
                        onMouseEnter={() => handleCellMouseEnter(room.id, d.dateStr)}
                        onClick={() => setSelectedReservationId(null)}
                        onDoubleClick={() => handleCellDoubleClick(room.id, d.dateStr)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            roomId: room.id,
                            dateStr: d.dateStr,
                          });
                        }}
                        onDragOver={(e) => handleDragOver(e, room.id, d.dateStr)}
                        onDrop={(e) => handleDrop(e, room.id, d.dateStr)}
                        className={`flex-1 min-w-[75px] border-r border-slate-800/60 relative cursor-pointer transition-all ${
                          d.isWeekend ? "bg-slate-800/40" : ""
                        } ${
                          d.isToday 
                            ? "bg-[#0284C7]/15 border-l-2 border-r-2 border-l-[#0284C7] border-r-[#0284C7] font-semibold" 
                            : ""
                        } ${
                          isHoverTarget ? "bg-[#0284C7]/30 border-2 border-dashed border-[#38BDF8]" : ""
                        } ${
                          isSelectedRangeCell
                            ? rangeAvailability.isAvailable
                              ? "bg-sky-500/40 border-2 border-sky-400 ring-2 ring-sky-300/80 shadow-[0_0_15px_rgba(56,189,248,0.6)] z-20 font-bold text-white scale-[1.01]"
                              : "bg-rose-500/40 border-2 border-rose-500 ring-2 ring-rose-400/80 shadow-[0_0_15px_rgba(244,63,94,0.6)] z-20 font-bold text-white scale-[1.01]"
                            : ""
                        }`}
                        title={`Quarto ${room.number} - ${d.label}${d.isToday ? " (HOJE)" : ""} (Clique e arraste para selecionar período)`}
                      >
                        {isSelectedRangeCell && minSelectedDate && d.dateStr === minSelectedDate && (
                          <div className={`absolute top-1 left-1 z-30 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap shadow-lg flex items-center gap-1 ${
                            rangeAvailability.isAvailable
                              ? "bg-sky-950 text-sky-200 border border-sky-400 animate-pulse"
                              : "bg-rose-950 text-rose-200 border border-rose-400 animate-bounce"
                          }`}>
                            {rangeAvailability.isAvailable ? (
                              <span>✓ Selecionado: {formatDateBr(minSelectedDate)} a {formatDateBr(maxSelectedDate!)}</span>
                            ) : (
                              <span>⚠️ Datas Ocupadas / Conflito</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* OVERLAY RESERVATION BLOCKS FOR THIS ROOM */}
                  {reservations
                    .filter((r) => {
                      if (r.roomId !== room.id && r.roomId !== room.number) return false;
                      // Checkout já concluído: quarto liberado, não bloquear o mapa com hospedagem encerrada
                      if (r.status === "CANCELLED" || r.status === "CHECKED_OUT") return false;
                      // Filtrar reservas expiradas por tolerância do assinante
                      if (isReservationExpired({
                        checkInDate: r.checkInDate,
                        checkInTime: r.checkInTime,
                        defaultCheckInTime: defaultCheckInTime || "14:00",
                        toleranceHours: reservationToleranceHours,
                        status: r.status,
                      }, now)) return false;
                      return true;
                    })
                    .map((res) => {
                      // Calculate horizontal position matching column indices
                      const startIndex = monthDays.findIndex((d) => d.dateStr === res.checkInDate);
                      // A barra acompanha diárias extras já lançadas na hospedagem (res.mapEndDate),
                      // mesmo sem alterar a "Dt.Prev.Saída" exibida (que continua usando checkOutDate).
                      const endIndex = monthDays.findIndex((d) => d.dateStr === (res.mapEndDate || res.checkOutDate));

                      if (startIndex === -1 && endIndex === -1) return null;

                      const startCol = startIndex !== -1 ? startIndex : 0;
                      const endCol = endIndex !== -1 ? endIndex : monthDays.length - 1;
                      // Inclui a coluna da data final de checkout (ex: até 17/08) na representação visual do mapa
                      const span = Math.max(1, endCol - startCol + 1);

                      const leftPercent = (startCol / monthDays.length) * 100;
                      const widthPercent = (span / monthDays.length) * 100;

                      const isHospedagem = res.status === "CHECKED_IN";
                      const isSelected = selectedReservationId === res.id;

                      return (
                        <div
                          key={res.id}
                          draggable={!isHospedagem}
                          onDragStart={(e) => handleDragStart(e, res)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => handleDragOver(e, room.id, res.checkOutDate)}
                          onDrop={(e) => handleDrop(e, room.id, res.checkOutDate)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isHospedagem) {
                              setSelectedReservationId(null);
                              toast.info(`ℹ️ HOSPEDAGEM EM VIGÊNCIA (${res.guestName}): Esta hospedagem está com check-in efetivado e serve apenas para consulta informativa no mapa.`);
                              return;
                            }
                            setSelectedReservationId((prev) => (prev === res.id ? null : res.id));
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isHospedagem) {
                              toast.info(`ℹ️ HOSPEDAGEM EM VIGÊNCIA (${res.guestName}): Esta hospedagem está com check-in efetivado e serve apenas para consulta informativa no mapa.`);
                              return;
                            }
                            setSelectedReservationId(res.id);
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              reservation: res,
                            });
                          }}
                          onDoubleClick={(e) => handleReservationDoubleClick(res, e)}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            top: "4px",
                            bottom: "4px",
                          }}
                          className={`absolute z-10 rounded-lg p-2 flex flex-col justify-between shadow-lg border transition-all ${
                            isHospedagem
                              ? isSelected
                                ? "bg-[#FEF08A] border-amber-500 ring-2 ring-amber-400 text-slate-950 shadow-amber-500/30 z-30 cursor-default font-semibold"
                                : "bg-[#FEF08A] hover:bg-[#FDE047] border-amber-400 text-slate-950 cursor-default shadow-md font-medium"
                              : isSelected
                              ? "bg-[#334155] border-[#38BDF8] ring-2 ring-[#38BDF8]/60 shadow-[#38BDF8]/20 z-30 cursor-grab active:cursor-grabbing text-slate-100"
                              : "bg-[#334155]/95 hover:bg-[#475569] border-slate-600 text-slate-100 cursor-grab active:cursor-grabbing"
                          }`}
                          title={
                            isHospedagem
                              ? `🟨 CHECK-IN EM CURSO (Quarto Ocupado - Informativo)\nHóspede: ${res.guestName}\nCheck-in realizado: ${formatDateBr(res.checkInDate)} às ${res.checkInTime}\nPrevisão Checkout: ${formatDateBr(res.checkOutDate)} às ${res.checkOutTime}\n(Item informativo - Não editável pelo mapa)`
                              : `🔹 RESERVA CONFIRMADA\nHóspede: ${res.guestName}\nChegada: ${formatDateBr(res.checkInDate)} às ${res.checkInTime}\nSaída: ${formatDateBr(res.checkOutDate)} às ${res.checkOutTime}\n(Arraste para mover | 2x clique para alterar | Delete para excluir)`
                          }
                        >
                          {/* Block Header */}
                          <div className="flex items-start justify-between gap-1 overflow-hidden">
                            <span className={`font-bold text-[11px] truncate uppercase leading-tight flex items-center gap-1 ${isHospedagem ? "text-slate-950" : "text-slate-100"}`}>
                              {isHospedagem && <Lock className="w-3 h-3 text-amber-800 shrink-0" />}
                              <span className="truncate">{res.guestName}</span>
                            </span>
                            {isHospedagem ? (
                              <span className="text-[8px] bg-amber-950 text-amber-300 font-black px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide flex items-center gap-0.5 shadow-sm border border-amber-800/60">
                                <UserCheck className="w-2.5 h-2.5 text-amber-400" /> EM VIGÊNCIA
                              </span>
                            ) : (
                              res.company && (
                                <span className="text-[9px] bg-slate-700 text-cyan-300 px-1 py-0.2 rounded shrink-0">
                                  {res.company}
                                </span>
                              )
                            )}
                          </div>

                          {/* Block Check-in & Check-out details */}
                          <div className={`text-[9px] font-mono space-y-0.5 mt-0.5 ${isHospedagem ? "text-slate-900 font-semibold" : "text-slate-300"}`}>
                            <div className="truncate">
                              <span className={isHospedagem ? "text-amber-900 font-bold" : "text-slate-400"}>
                                {isHospedagem ? "Check-in realizado:" : "Data chegada:"}
                              </span>{" "}
                              {formatDateBr(res.checkInDate)} {res.checkInTime}
                            </div>
                            <div className="truncate">
                              <span className={isHospedagem ? "text-amber-900 font-bold" : "text-slate-400"}>
                                Dt.Prev.Saída:
                              </span>{" "}
                              {formatDateBr(res.checkOutDate)} {res.checkOutTime}
                            </div>
                          </div>

                          {/* Envio de FNRH direto na reserva — mesma ação do toolbar/menu de contexto,
                              mas sem precisar selecionar a reserva antes. */}
                          {!isHospedagem && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendPreCheckinLink(res);
                              }}
                              disabled={sendingPreCheckinId === res.id}
                              title="Enviar/reenviar FNRH via WhatsApp"
                              className={`mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold border flex items-center gap-1 truncate transition-colors disabled:opacity-60 ${
                                res.fnrhCompleted
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                                  : res.precheckinSent
                                  ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
                                  : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-600/60"
                              }`}
                            >
                              <WhatsAppIcon className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">
                                {sendingPreCheckinId === res.id
                                  ? "Enviando..."
                                  : res.fnrhCompleted
                                  ? "FNRH OK"
                                  : res.precheckinSent
                                  ? "Reenviar FNRH"
                                  : "Enviar FNRH"}
                              </span>
                            </button>
                          )}

                          {/* Badge de alerta: expira em breve (menos de 2 horas) */}
                          {(() => {
                            const expDate = getReservationExpirationDate({
                              checkInDate: res.checkInDate,
                              checkInTime: res.checkInTime,
                              defaultCheckInTime: defaultCheckInTime || "14:00",
                              toleranceHours: reservationToleranceHours,
                              status: res.status,
                            });
                            if (!expDate || res.status === "CHECKED_IN") return null;
                            const msLeft = expDate.getTime() - now.getTime();
                            const hoursLeft = msLeft / (1000 * 60 * 60);
                            if (hoursLeft > 0 && hoursLeft <= 2) {
                              return (
                                <span className="mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1 truncate">
                                  ⏱ Expira: {formatExpirationLimit(expDate)}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      );
                    })}

                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

      {/* MODAL MODERNO DE CRIAR / ALTERAR RESERVA (Substitui modals antigos) */}
      <LancarReservaModal
        isOpen={showLancarModal}
        onClose={() => {
          setShowLancarModal(false);
          setActiveEditReservationData(null);
          setModalCheckOutDate(undefined);
        }}
        onSuccess={() => {
          setShowLancarModal(false);
          setActiveEditReservationData(null);
          setModalCheckOutDate(undefined);
          if (onRefresh) onRefresh();
        }}
        initialRoomNumber={modalRoomNumber}
        initialCheckInDate={modalCheckInDate}
        initialCheckOutDate={modalCheckOutDate}
        editReservationData={activeEditReservationData}
        existingReservations={reservations}
        tenantId="TNT-01"
      />

      {/* MODAL: CONFIRMAR EXCLUSÃO (Tecla DELETE em cima da reserva) */}
      {showDeleteModal && selectedReservationId && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in ${
          theme.isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"
        }`}>
          <div className={`border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl ${
            theme.isDark ? "bg-[#0F172A] border-rose-900/50 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className={`flex items-center gap-3 border-b pb-3 ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${theme.isDark ? "text-white" : "text-slate-900"}`}>Excluir Reserva</h3>
                <p className="text-xs opacity-60">Esta ação excluirá permanentemente a reserva do mapa.</p>
              </div>
            </div>

            {(() => {
              const res = reservations.find(r => r.id === selectedReservationId);
              if (!res) return null;

              return (
                <div className={`p-3.5 rounded-xl border space-y-1 text-xs ${
                  theme.isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"
                }`}>
                  <div className={`font-bold text-sm ${theme.isDark ? "text-white" : "text-slate-900"}`}>{res.guestName}</div>
                  <div className="opacity-70 font-mono text-[11px]">
                    Quarto {res.roomId} • Período: {formatDateBr(res.checkInDate)} a {formatDateBr(res.checkOutDate)}
                  </div>
                  <div className="text-emerald-600 font-mono font-bold text-[11px]">
                    Valor Total: R$ {res.totalAmount.toFixed(2)}
                  </div>
                </div>
              );
            })()}

            <p className="text-xs text-rose-600 font-semibold">
              Deseja realmente confirmar a exclusão desta reserva?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-medium ${
                  theme.isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Sim, Excluir Reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISUALIZAR RESERVA / VOUCHER */}
      <VisualizarReservaModal
        isOpen={showVisualizarModal}
        onClose={() => {
          setShowVisualizarModal(false);
          setVisualizeReservationData(null);
        }}
        reservation={visualizeReservationData}
        onEdit={(res) => handleOpenEditarModal(res)}
      />

      {/* MENU DE CONTEXTO (BOTÃO DIREITO NO MAPA) */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-[#0F172A] border border-slate-700 text-white rounded-xl shadow-2xl p-1.5 min-w-[200px] text-xs font-semibold space-y-1 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.reservation ? (
            <>
              <div className="px-2.5 py-1 text-[10px] text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider truncate max-w-[200px]">
                {contextMenu.reservation.guestName}
              </div>
              <button
                onClick={() => {
                  const res = contextMenu.reservation;
                  setContextMenu(null);
                  handleOpenVisualizarModal(res);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-sky-400" />
                Visualizar Voucher
              </button>
              <button
                onClick={() => {
                  const res = contextMenu.reservation;
                  setContextMenu(null);
                  handleOpenEditarModal(res);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                Editar Reserva
              </button>
              <button
                onClick={() => {
                  const res = contextMenu.reservation;
                  setContextMenu(null);
                  handleQuickSendWhatsApp(res);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Enviar Voucher WhatsApp
              </button>
              <div className="border-t border-slate-800 my-0.5"></div>
              <button
                onClick={() => {
                  const res = contextMenu.reservation;
                  setContextMenu(null);
                  handleOpenExcluirModal(res);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-950/60 text-rose-400 hover:text-rose-300 flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Reserva
              </button>
            </>
          ) : (
            <>
              <div className="px-2.5 py-1 text-[10px] text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
                Quarto {contextMenu.roomId} • {formatDateBr(contextMenu.dateStr || "")}
              </div>
              <button
                onClick={() => {
                  const { roomId, dateStr } = contextMenu;
                  setContextMenu(null);
                  if (roomId && dateStr) handleCellDoubleClick(roomId, dateStr);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 flex items-center gap-2 text-slate-200 hover:text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#0284C7]" />
                Incluir Reserva neste Quarto/Data
              </button>
            </>
          )}
        </div>
      )}

    </div>
  );
}
