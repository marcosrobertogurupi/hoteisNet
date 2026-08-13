"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Search, Plus, Trash2, Calendar, DollarSign, Save,
  CheckCircle2, AlertCircle, MessageSquare, ChevronDown,
  BedDouble, User, Phone, FileText, Printer, Loader2
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import {
  LISTA_TARIFAS, TariffOption,
  validateCPF, formatCPF, formatCNPJ,
} from "@/components/CheckinHospedagemModal";
import {
  generateReservaPdfBase64,
  PdfReservaDiariaRow,
  PdfReservaPayment,
} from "@/utils/pdfGenerator";
import CustomDatePicker from "@/components/CustomDatePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReservaPaymentItem {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string;
}

export interface RoomOption {
  id: string;
  number: string;
  floor?: string;
  status?: string;
  room_categories?: { name?: string; description?: string };
}

const PAYMENT_METHODS = ["DINHEIRO", "CARTÃO", "PIX", "FATURA", "SALDO DE CLIENTE", "TRANSF.DÉBITO"];

const DEFAULT_ROOM_OPTIONS: RoomOption[] = [
  { id: "101", number: "101", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "SUÍTE LUXO MAR", description: "Suíte Luxo Mar" } },
  { id: "102", number: "102", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "SUÍTE LUXO MAR", description: "Suíte Luxo Mar" } },
  { id: "103", number: "103", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "104", number: "104", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "105", number: "105", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "106", number: "106", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "107", number: "107", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "108", number: "108", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "109", number: "109", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "110", number: "110", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "111", number: "111", floor: "1º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "STANDARD SUPERIOR", description: "Standard Superior" } },
  { id: "201", number: "201", floor: "2º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "MASTER FAMÍLIA", description: "Master Família" } },
  { id: "202", number: "202", floor: "2º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "MASTER FAMÍLIA", description: "Master Família" } },
  { id: "203", number: "203", floor: "2º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "SUÍTE PRESIDENCIAL", description: "Suíte Presidencial" } },
  { id: "204", number: "204", floor: "2º ANDAR", status: "VACANT_CLEAN", room_categories: { name: "SUÍTE PRESIDENCIAL", description: "Suíte Presidencial" } },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getTodayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getNowTimeStr(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowLocalMin(): string {
  const todayStr = getTodayDateStr();
  const nowTime = getNowTimeStr();
  return `${todayStr}T${nowTime}`;
}
function localToBrDateTime(v: string): string {
  try {
    const [dp, tp] = v.split("T");
    const [yy, mm, dd] = dp.split("-");
    return `${dd}/${mm}/${yy} ${tp || "00:00"}`;
  } catch { return ""; }
}
function localToDate(v: string) { return v ? v.split("T")[0] : ""; }
function tomorrowStr(): string {
  const d = new Date(Date.now() + 86400000);
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nowBrDisplay(): string {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function brDate(v: string) {
  if (!v) return "";
  const [dp] = v.split("T");
  const [yy, mm, dd] = dp.split("-");
  return `${dd}/${mm}/${yy}`;
}

function parseYMD(str: any): { year: number; month: number; day: number } | null {
  if (!str || typeof str !== "string") return null;
  const clean = str.trim();
  let y = 0, m = 0, d = 0;
  if (clean.includes("/")) {
    const [datePart] = clean.split(" ");
    const parts = datePart.split("/");
    if (parts.length === 3) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
    }
  } else if (clean.includes("-")) {
    const datePart = clean.split("T")[0].split(" ")[0];
    const parts = datePart.split("-");
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    }
  }
  if (y && m && d && !isNaN(y) && !isNaN(m) && !isNaN(d)) {
    return { year: y, month: m, day: d };
  }
  return null;
}

function getOccupiedDatesFromRange(checkInStr: string, checkOutStr: string): string[] {
  const start = parseYMD(checkInStr);
  const end = parseYMD(checkOutStr);
  if (!start || !end) return [];

  const dates: string[] = [];
  const cur = new Date(start.year, start.month - 1, start.day, 12, 0, 0);
  const last = new Date(end.year, end.month - 1, end.day, 12, 0, 0);

  if (cur.getTime() >= last.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    return [`${y}-${m}-${d}`];
  }

  while (cur < last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }

  return dates;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface LancarReservaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (reservationNumber: string) => void;
  tenantId?: string;
  operatorName?: string;
  cashRegisterId?: string;
  initialRoomNumber?: string;
  initialCheckInDate?: string;
  initialCheckOutDate?: string;
  editReservationData?: any;
  existingReservations?: any[];
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function LancarReservaModal({
  isOpen,
  onClose,
  onSuccess,
  tenantId = "TNT-01",
  operatorName = "RECEPÇÃO",
  cashRegisterId,
  initialRoomNumber,
  initialCheckInDate,
  initialCheckOutDate,
  editReservationData,
  existingReservations = [],
}: LancarReservaModalProps) {
  const { theme, hotelName } = useTheme();
  const toast = useToast();
  const isDark = theme.isDark;

  // ── STEP 1: Tarifa / Quarto ─────────────────────────────────────────────────
  const [tariffs, setTariffs] = useState<TariffOption[]>(LISTA_TARIFAS);
  const [selectedTariff, setSelectedTariff] = useState<TariffOption>(LISTA_TARIFAS[2]);
  const [showTariffDropdown, setShowTariffDropdown] = useState(false);
  const tariffRef = useRef<HTMLDivElement>(null);

  const [rooms, setRooms] = useState<RoomOption[]>(DEFAULT_ROOM_OPTIONS);
  const [selectedRoom, setSelectedRoom] = useState<RoomOption | null>(null);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // ── STEP 2: Hóspede ─────────────────────────────────────────────────────────
  const [docType, setDocType] = useState<"CPF" | "CNPJ" | "PASSAPORTE">("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [hasWhatsapp, setHasWhatsapp] = useState(false);
  const [wppVerifying, setWppVerifying] = useState(false);
  const [wppStatus, setWppStatus] = useState<"idle" | "ok" | "no" | "loading">("idle");
  const [guestId, setGuestId] = useState<string | null>(null);

  const [hubLoading, setHubLoading] = useState(false);
  const [hubMessage, setHubMessage] = useState<string | null>(null);

  // Search guest modal
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Período ─────────────────────────────────────────────────────────────────
  const { defaultCheckOutTime, defaultCheckInTime } = useTheme();
  const [dtChegadaLocal, setDtChegadaLocal] = useState(nowLocalMin);
  const [dtSaidaLocal, setDtSaidaLocal] = useState(() => `${tomorrowStr()}T${defaultCheckOutTime || "12:00"}`);
  const [dateError, setDateError] = useState<string | null>(null);
  const [adults, setAdults] = useState(selectedTariff?.pax || 1);
  const [children, setChildren] = useState(0);
  const [nights, setNights] = useState(1);

  const dtChegada = localToBrDateTime(dtChegadaLocal);
  const dtSaida = localToBrDateTime(dtSaidaLocal);

  // Sincronizar número de adultos com a capacidade (pax) da tarifa selecionada
  useEffect(() => {
    if (selectedTariff && selectedTariff.pax) {
      setAdults(selectedTariff.pax);
    }
  }, [selectedTariff]);

  // ── Pagamentos ──────────────────────────────────────────────────────────────
  const [payments, setPayments] = useState<ReservaPaymentItem[]>([]);
  const [newPmtAmount, setNewPmtAmount] = useState("0,00");
  const [newPmtMethod, setNewPmtMethod] = useState("PIX");
  const [newPmtDate, setNewPmtDate] = useState(nowBrDisplay);
  const [discount, setDiscount] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  // ─── Derived calculations ──────────────────────────────────────────────────
  const totalDiarias = nights * (selectedTariff?.price || 0);
  const totalAdiantamento = payments.reduce((s, p) => s + p.amount, 0);
  const totalLiquido = Math.max(0, totalDiarias - discount - totalAdiantamento);

  // ─── Occupied Dates Detection ──────────────────────────────────────────────
  const [allReservations, setAllReservations] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/reservations?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.reservations)) {
          setAllReservations(data.reservations);
        }
      })
      .catch(() => {});
  }, [isOpen, tenantId]);

  const occupiedDates = React.useMemo(() => {
    if (!selectedRoom) return [];
    const targetId = String(selectedRoom.id || "").trim().toLowerCase();
    const targetNum = String(selectedRoom.number || "").trim().toLowerCase();
    const dateSet = new Set<string>();

    const combinedList = [
      ...(existingReservations || []),
      ...(allReservations || [])
    ];

    combinedList.forEach((r: any) => {
      if (!r || r.status === "CANCELLED") return;

      if (
        editReservationData &&
        (r.id === editReservationData.id || r.reservationNumber === editReservationData.reservationNumber)
      ) {
        return; // Skip current reservation being edited
      }

      const rRoomId = String(r.roomId || r.room_id || "").trim().toLowerCase();
      const rRoomNum = String(r.roomNumber || r.room_number || (r.rooms && r.rooms.number) || "").trim().toLowerCase();

      const isMatch =
        (targetNum && (rRoomNum === targetNum || rRoomId === targetNum)) ||
        (targetId && (rRoomId === targetId || rRoomNum === targetId));

      if (isMatch) {
        const startStr = r.checkInDate || r.check_in_date || r.checkInDateRaw;
        const endStr = r.checkOutDate || r.check_out_date || r.checkOutDateRaw;
        if (startStr && endStr) {
          const days = getOccupiedDatesFromRange(startStr, endStr);
          days.forEach(d => dateSet.add(d));
        }
      }
    });

    return Array.from(dateSet);
  }, [selectedRoom, allReservations, existingReservations, editReservationData]);

  // ─── Load rooms from Supabase ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLoadingRooms(true);
    fetch(`/api/reservations/rooms?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.rooms && data.rooms.length > 0) {
          setRooms(data.rooms);
        } else {
          setRooms(DEFAULT_ROOM_OPTIONS);
        }
      })
      .catch(() => { setRooms(DEFAULT_ROOM_OPTIONS); })
      .finally(() => setLoadingRooms(false));
  }, [isOpen, tenantId]);

  // Pre-select room if initialRoomNumber is provided
  useEffect(() => {
    if (isOpen && initialRoomNumber) {
      const match = rooms.find(r => r.number === initialRoomNumber || r.id === initialRoomNumber);
      if (match) {
        setSelectedRoom(match);
      } else {
        setSelectedRoom({ id: initialRoomNumber, number: initialRoomNumber });
      }
    }
  }, [isOpen, initialRoomNumber, rooms]);

  // Populate data when editing an existing reservation or opening with specific date
  useEffect(() => {
    if (!isOpen) return;
    if (editReservationData) {
      setGuestName(editReservationData.guestName || "");
      setDocNumber(editReservationData.cpf || editReservationData.guestCpf || "");
      setGuestPhone(editReservationData.phone || editReservationData.guestPhone || "");

      const inDate = editReservationData.checkInDate ? editReservationData.checkInDate.split("T")[0] : getTodayDateStr();
      const inTime = editReservationData.checkInTime || defaultCheckInTime || "14:00";
      setDtChegadaLocal(`${inDate}T${inTime}`);

      const outDate = editReservationData.checkOutDate ? editReservationData.checkOutDate.split("T")[0] : tomorrowStr();
      const outTime = editReservationData.checkOutTime || defaultCheckOutTime || "12:00";
      setDtSaidaLocal(`${outDate}T${outTime}`);

      const rmNum = editReservationData.roomId || editReservationData.roomNumber || initialRoomNumber;
      if (rmNum) {
        const match = rooms.find(r => r.number === String(rmNum) || r.id === String(rmNum));
        if (match) setSelectedRoom(match);
        else setSelectedRoom({ id: String(rmNum), number: String(rmNum) });
      }

      if (editReservationData.dailyRate) {
        setSelectedTariff(prev => ({
          ...prev,
          price: editReservationData.dailyRate
        }));
      }

      if (editReservationData.depositPaid && editReservationData.depositPaid > 0) {
        setPayments([{
          id: "pmt-initial",
          date: nowBrDisplay(),
          amount: editReservationData.depositPaid,
          paymentMethod: "DINHEIRO"
        }]);
      } else {
        setPayments([]);
      }
    } else {
      // RESET COMPLETO PARA NOVA RESERVA
      setGuestName("");
      setDocNumber("");
      setGuestPhone("");
      setGuestId(null);
      setPayments([]);
      setDiscount(0);
      setDiscountPct(0);

      const inDate = initialCheckInDate ? initialCheckInDate.split("T")[0] : getTodayDateStr();
      const inTime = defaultCheckInTime || "14:00";
      setDtChegadaLocal(`${inDate}T${inTime}`);

      let outDate = "";
      if (initialCheckOutDate) {
        outDate = initialCheckOutDate.split("T")[0];
      } else {
        const startDateObj = new Date(inDate);
        const endDateObj = new Date(startDateObj);
        endDateObj.setDate(startDateObj.getDate() + 2);
        const endMonth = String(endDateObj.getMonth() + 1).padStart(2, "0");
        const endDay = String(endDateObj.getDate()).padStart(2, "0");
        outDate = `${endDateObj.getFullYear()}-${endMonth}-${endDay}`;
      }
      setDtSaidaLocal(`${outDate}T${defaultCheckOutTime || "12:00"}`);

      if (initialRoomNumber) {
        const match = rooms.find(r => r.number === String(initialRoomNumber) || r.id === String(initialRoomNumber));
        if (match) setSelectedRoom(match);
        else setSelectedRoom({ id: String(initialRoomNumber), number: String(initialRoomNumber) });
      }
    }
  }, [isOpen, editReservationData, initialCheckInDate, initialCheckOutDate, initialRoomNumber, rooms, defaultCheckInTime, defaultCheckOutTime]);

  // Load tariffs from Supabase
  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/reservations/tariffs?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.tariffs.length > 0) {
          const mapped: TariffOption[] = data.tariffs.map((t: any) => ({
            id: t.id, name: t.name, pax: t.adults || 1, price: parseFloat(t.price) || 0,
          }));
          setTariffs(mapped);
          setSelectedTariff(mapped[0]);
        }
      })
      .catch(() => {});
  }, [isOpen, tenantId]);

  // Run migration on first open
  useEffect(() => {
    if (!isOpen || migrationDone) return;
    fetch("/api/reservations/migrate", { method: "POST" })
      .then(r => r.json())
      .then(() => setMigrationDone(true))
      .catch(() => setMigrationDone(true));
  }, [isOpen, migrationDone]);

  // Recalculate nights
  useEffect(() => {
    try {
      const d1 = new Date(dtChegadaLocal);
      const d2 = new Date(dtSaidaLocal);
      const diff = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
      setNights(diff);
    } catch { setNights(1); }
  }, [dtChegadaLocal, dtSaidaLocal]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tariffRef.current && !tariffRef.current.contains(e.target as Node)) setShowTariffDropdown(false);
      if (roomRef.current && !roomRef.current.contains(e.target as Node)) setShowRoomDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Update discount from pct
  useEffect(() => {
    setDiscount(Math.round(totalDiarias * (discountPct / 100) * 100) / 100);
  }, [discountPct, totalDiarias]);

  if (!isOpen) return null;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDtChegadaChange = (v: string) => {
    if (!v) return;
    const todayStr = getTodayDateStr();
    const selectedDate = v.split("T")[0];

    // 1. Data de chegada não pode ser anterior à data do dia
    if (selectedDate < todayStr) {
      setDateError("Data de chegada não pode ser anterior à data de hoje.");
      return;
    }

    setDateError(null);
    let finalDateTime = v;

    // 2. Se a data for o dia assumir a hora atual; se for superior assumir a hora configurada de check-in
    if (selectedDate === todayStr) {
      const nowTime = getNowTimeStr();
      finalDateTime = `${todayStr}T${nowTime}`;
    } else if (selectedDate > todayStr) {
      const checkInTime = defaultCheckInTime || "14:00";
      finalDateTime = `${selectedDate}T${checkInTime}`;
    }

    setDtChegadaLocal(finalDateTime);

    // Ajustar data de saída se for menor ou igual à chegada
    const newD = selectedDate;
    const outD = localToDate(dtSaidaLocal);
    if (outD <= newD) {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      const pad = (n: number) => (n < 10 ? "0" + n : String(n));
      setDtSaidaLocal(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${defaultCheckOutTime || "12:00"}`);
    }
  };

  const handleDtSaidaChange = (v: string) => {
    const inD = localToDate(dtChegadaLocal);
    const outD = localToDate(v);
    if (outD <= inD) {
      setDateError("Data de saída deve ser posterior à data de chegada.");
      return;
    }
    setDateError(null);
    const corrected = `${outD}T${defaultCheckOutTime || "12:00"}`;
    setDtSaidaLocal(corrected);
  };

  // Verify WhatsApp
  const handleVerifyWhatsapp = async () => {
    const clean = guestPhone.replace(/\D/g, "");
    if (clean.length < 10) return;
    setWppStatus("loading");
    try {
      const res = await fetch("/api/stay/verify-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: guestPhone, guestName }),
      });
      const data = await res.json();
      if (data.success && data.verifiedPhone) {
        const hw = data.verifiedPhone.hasWhatsapp === true;
        setHasWhatsapp(hw);
        setWppStatus(hw ? "ok" : "no");
      } else {
        setWppStatus("no");
        setHasWhatsapp(false);
      }
    } catch {
      // fallback: if 10+ digits, assume valid
      setWppStatus(clean.length >= 11 ? "ok" : "no");
      setHasWhatsapp(clean.length >= 11);
    }
  };

  // Busca de CPF: Primeiro busca no Supabase, só requisita Hub se não encontrar
  const handleHubSearch = async () => {
    const clean = docNumber.replace(/\D/g, "");
    if (docType === "CPF" && clean.length !== 11) {
      toast.error("CPF inválido — informe 11 dígitos.");
      return;
    }
    if (!clean) return;

    setHubLoading(true);
    setHubMessage(null);

    try {
      // 1. Buscar primeiro os dados no banco Supabase
      const dbRes = await fetch(`/api/cadastros/hospedes?q=${encodeURIComponent(clean)}&tenantId=${tenantId}`);
      const dbData = await dbRes.json();

      if (dbData.guests && dbData.guests.length > 0) {
        const found = dbData.guests.find((g: any) => g.cpf && g.cpf.replace(/\D/g, "") === clean) || dbData.guests[0];
        if (found) {
          const gName = (found.fullName || found.name || "").toUpperCase();
          setGuestName(gName);
          if (found.cpf) setDocNumber(formatCPF(found.cpf));
          setGuestPhone(found.whatsappPhone || found.phone || "");
          setHasWhatsapp(found.hasWhatsapp || false);
          setWppStatus(found.hasWhatsapp ? "ok" : "idle");
          setGuestId(found.id || null);
          setHubMessage(`✓ Origem: BANCO DE DADOS (Supabase) — Hóspede localizado: ${gName}`);
          toast.success("Hóspede localizado no BANCO DE DADOS!");
          setHubLoading(false);
          return; // Achou no banco: NÃO chama a API Hub do Desenvolvedor!
        }
      }

      // 2. Só requisitar a API Hub do Desenvolvedor quando o CPF não foi encontrado no banco
      const res = await fetch(`/api/stay/hub-consult-cpf?cpf=${clean}&tenantId=${tenantId}`);
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        const gName = (d.nome || guestName).toUpperCase();
        const gPhone = (d.telefones && d.telefones.length > 0) ? d.telefones[0] : guestPhone;
        setGuestName(gName);
        if (gPhone) setGuestPhone(gPhone);
        setHubMessage(`✓ Origem: API HUB DESENVOLVEDOR (Receita Federal) — Dados carregados para ${gName}`);
        toast.info("Dados buscados via API Hub do Desenvolvedor!");

        // Cadastrar automaticamente no banco de dados para que buscas posteriores encontrem no Supabase
        try {
          const saveRes = await fetch("/api/cadastros/hospedes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId,
              fullName: gName,
              cpf: clean,
              phone: gPhone || null,
            }),
          });
          const saveData = await saveRes.json();
          if (saveData && saveData.id) {
            setGuestId(saveData.id);
          }
        } catch {
          // ignora se der duplicidade
        }
      } else {
        setHubMessage(data.message || "✗ CPF não localizado no BANCO DE DADOS nem na API HUB DESENVOLVEDOR.");
      }
    } catch {
      setHubMessage("Erro ao consultar dados do CPF.");
    } finally {
      setHubLoading(false);
    }
  };

  // Search guests in DB
  const handleSearchGuest = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/cadastros/hospedes?q=${encodeURIComponent(q)}&tenantId=${tenantId}`);
      const data = await res.json();
      const list = data.guests || (Array.isArray(data) ? data : []);
      setSearchResults(list);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectGuest = (g: any) => {
    setGuestName(g.fullName || g.name || "");
    setDocNumber(g.cpf ? formatCPF(g.cpf) : (g.passport || ""));
    setGuestPhone(g.whatsappPhone || g.phone || "");
    setHasWhatsapp(g.hasWhatsapp || false);
    setWppStatus(g.hasWhatsapp ? "ok" : "no");
    setGuestId(g.id || null);
    setShowSearchModal(false);
  };

  // Add payment
  const handleAddPayment = () => {
    const amt = parseFloat(newPmtAmount.replace(",", ".").replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) { toast.error("Informe um valor de pagamento válido."); return; }
    setPayments(prev => [...prev, {
      id: crypto.randomUUID(),
      date: newPmtDate || nowBrDisplay(),
      amount: amt,
      paymentMethod: newPmtMethod,
    }]);
    setNewPmtAmount("0,00");
  };

  const handleRemovePayment = (id: string) => {
    setPayments(prev => prev.filter(p => p.id !== id));
  };

  // ─── Generate daily rows ────────────────────────────────────────────────────
  function buildDailyRows(): PdfReservaDiariaRow[] {
    const rows: PdfReservaDiariaRow[] = [];
    try {
      const d1 = new Date(dtChegadaLocal.split("T")[0]);
      for (let i = 0; i < nights; i++) {
        const start = new Date(d1);
        start.setDate(d1.getDate() + i);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        const fmt = (d: Date) => {
          const pad = (n: number) => (n < 10 ? "0" + n : String(n));
          return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
        };
        rows.push({ dtReserva: fmt(start), dtFinal: fmt(end), diaria: selectedTariff?.price || 0 });
      }
    } catch {}
    return rows;
  }

  // ─── SAVE ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedRoom) { toast.error("Selecione um quarto."); return; }
    if (!selectedTariff) { toast.error("Selecione uma tarifa."); return; }
    if (!guestName.trim()) { toast.error("Informe o nome do hóspede."); return; }
    if (!dtChegadaLocal || !dtSaidaLocal) { toast.error("Informe o período da reserva."); return; }

    setSaving(true);
    try {
      // 1. Create reservation in Supabase
      const body = {
        tenantId,
        roomId: selectedRoom.id,
        tariffId: selectedTariff.id,
        tariffName: selectedTariff.name,
        guestName: guestName.toUpperCase(),
        guestCpf: docType === "CPF" ? docNumber : null,
        guestPhone: guestPhone || null,
        guestId,
        checkInDate: new Date(dtChegadaLocal).toISOString(),
        checkOutDate: new Date(dtSaidaLocal).toISOString(),
        dailyRate: selectedTariff.price,
        totalDiarias,
        discountAmount: discount,
        totalAmount: totalLiquido,
        depositPaid: totalAdiantamento,
        adults,
        children,
        hasWhatsapp,
        cashRegisterId: cashRegisterId || null,
        operatorName,
        roomDescription: selectedRoom.room_categories?.description || null,
        roomCategory: selectedRoom.room_categories?.name || null,
        roomFloor: selectedRoom.floor || null,
        payments: payments.map(p => ({ amount: p.amount, paymentMethod: p.paymentMethod })),
      };

      let data: any = {};
      let reservationNumber = editReservationData?.reservationNumber || editReservationData?.id || "";

      if (editReservationData?.id) {
        const patchBody = {
          id: editReservationData.id,
          tenantId,
          roomId: selectedRoom.id,
          guestName: guestName.toUpperCase(),
          guestCpf: docType === "CPF" ? docNumber : null,
          guestPhone: guestPhone || null,
          checkInDate: dtChegadaLocal.split("T")[0],
          checkOutDate: dtSaidaLocal.split("T")[0],
          dailyRate: selectedTariff.price,
          depositPaid: totalAdiantamento,
          totalAmount: totalLiquido,
          notes: editReservationData.notes || null,
          status: editReservationData.status || "CONFIRMED"
        };
        const res = await fetch("/api/reservations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody)
        });
        const rawText = await res.text();
        try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { success: false, error: rawText }; }
        if (!data.success) {
          toast.error(data.error || "Erro ao atualizar reserva.");
          setSaving(false);
          return;
        }
        toast.success(`Reserva ${reservationNumber} atualizada com sucesso!`);
      } else {
        const res = await fetch("/api/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const rawText = await res.text();
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = { success: false, error: rawText || "Erro no servidor ao salvar reserva." };
        }

        if (!data.success) {
          toast.error(data.error || "Erro ao salvar reserva.");
          setSaving(false);
          return;
        }
        reservationNumber = data.reservationNumber || "";
        toast.success(`Reserva ${reservationNumber} criada com sucesso!`);
      }

      // 2. Generate PDF
      const pdfData = {
        hotelName: hotelName || "HOTEL IDEAL",
        reservationNumber,
        issueDate: nowBrDisplay(),
        roomNumber: selectedRoom.number,
        roomDescription: selectedRoom.room_categories?.description || "",
        roomCategory: selectedRoom.room_categories?.name || "",
        roomFloor: selectedRoom.floor || "TÉRREO",
        guestName: guestName.toUpperCase(),
        guestCpf: docType === "CPF" ? docNumber : "",
        guestPhone,
        checkInDate: dtChegada,
        checkOutDate: dtSaida,
        tariffName: selectedTariff.name,
        adults,
        children,
        dailyRows: buildDailyRows(),
        payments: payments.map(p => ({ paymentDate: p.date, amount: p.amount, paymentMethod: p.paymentMethod })) as PdfReservaPayment[],
        totals: { totalDiarias, totalAdiantamento, desconto: discount, totalLiquido },
      };

      const pdfBase64 = generateReservaPdfBase64(pdfData);

      // 3. Auto-print
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = pdfBase64;
      document.body.appendChild(iframe);
      iframe.onload = () => { setTimeout(() => { iframe.contentWindow?.print(); }, 400); };

      // 4. Send via WhatsApp if has active WhatsApp
      if (hasWhatsapp && guestPhone) {
        const caption = `Segue confirmação da reserva para ${guestName.toUpperCase()} no período: checkin: ${dtChegada} a checkout: ${dtSaida}`;
        const wppRes = await fetch("/api/uazapi/send-reserva", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: guestPhone,
            caption,
            pdfBase64: pdfBase64.replace(/^data:application\/pdf;base64,/, ""),
            filename: `Confirmacao_Reserva_${reservationNumber}.pdf`,
            guestName: guestName.toUpperCase(),
          }),
        });
        const wppText = await wppRes.text();
        let wppData: any = {};
        try { wppData = wppText ? JSON.parse(wppText) : {}; } catch { wppData = {}; }
        if (wppData.success) {
          toast.success("Confirmação enviada via WhatsApp!");
        } else {
          toast.error("Reserva salva, mas não foi possível enviar o WhatsApp: " + (wppData.message || ""));
        }
      }

      onSuccess?.(reservationNumber);
      onClose();
    } catch (err: any) {
      toast.error("Erro inesperado: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Theme helpers ─────────────────────────────────────────────────────────
  const overlay = isDark ? "bg-slate-950/85 backdrop-blur-md" : "bg-slate-900/50 backdrop-blur-sm";
  const box = isDark
    ? "bg-[#0F172A] border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]"
    : "bg-white border border-slate-200 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]";
  const hdr = isDark
    ? "px-5 py-3 bg-gradient-to-r from-[#0c1a2e] via-slate-900 to-[#0c1a2e] border-b border-slate-700"
    : "px-5 py-3 bg-slate-100 border-b border-slate-200";
  const fs = isDark
    ? "rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 space-y-2.5"
    : "rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5";
  const leg = isDark ? "px-2 text-xs font-bold text-[#00b4d8]" : "px-2 text-xs font-bold text-[#0284C7]";
  const inp = isDark
    ? "w-full bg-slate-800/80 border border-slate-600/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00b4d8] transition-colors"
    : "w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#0284C7]";
  const lbl = isDark ? "block text-[10px] font-semibold text-slate-400 mb-0.5" : "block text-[10px] font-semibold text-slate-500 mb-0.5";
  const txt = isDark ? "text-white" : "text-slate-900";
  const txt2 = isDark ? "text-slate-300" : "text-slate-600";

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`fixed inset-0 z-50 ${overlay} flex items-center justify-center p-2 overflow-y-auto`}>
      <div className={box}>
        {/* HEADER */}
        <div className={`${hdr} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#00b4d8]" />
            <span className={`text-sm font-bold ${txt}`}>
              {editReservationData ? `Alterar Reserva (${editReservationData.reservationNumber || editReservationData.id})` : "Lançar Reserva"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">— Passo 1: Tarifa/Quarto → Passo 2: Hóspede/Período/Pagamento</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* BODY — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── SEÇÃO 1: TARIFA / QUARTO ────────────────────────────────── */}
          <fieldset className={fs}>
            <legend className={leg}>1 - Tarifa / Quarto</legend>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tarifa */}
              <div className="col-span-2">
                <label className={lbl}>Tarifa</label>
                <div className="relative" ref={tariffRef}>
                  <button
                    type="button"
                    onClick={() => setShowTariffDropdown(v => !v)}
                    className={`${inp} flex items-center justify-between font-medium`}
                  >
                    <span className="truncate">
                      {selectedTariff 
                        ? `${selectedTariff.name} • ${selectedTariff.pax || 1} ${(selectedTariff.pax || 1) === 1 ? "Adulto" : "Adultos"} • R$ ${selectedTariff.price.toFixed(2)}` 
                        : "Selecione a tarifa..."}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-1" />
                  </button>
                  {showTariffDropdown && (
                    <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl overflow-y-auto max-h-52 border divide-y ${isDark ? "bg-[#0F172A] border-slate-700 divide-slate-800" : "bg-white border-slate-200 divide-slate-100"}`}>
                      {tariffs.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTariff(t); setShowTariffDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#0284C7]/20 flex items-center justify-between gap-2 ${t.id === selectedTariff?.id ? "bg-[#0284C7]/30 text-[#00b4d8] font-bold" : txt2}`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="truncate">{t.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 bg-sky-500/15 text-sky-400 border border-sky-500/30">
                              {t.pax || 1} {(t.pax || 1) === 1 ? "Adulto" : "Adultos"}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-[#10B981] shrink-0">R$ {t.price.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Valor diária */}
              <div>
                <label className={lbl}>Valor Diária (R$)</label>
                <div className={`${inp} font-mono font-bold text-[#10B981] flex items-center gap-1`}>
                  <DollarSign className="w-3 h-3" />
                  {(selectedTariff?.price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-2">
              {/* Quarto */}
              <div className="col-span-2">
                <label className={lbl}>Quarto</label>
                <div className="relative" ref={roomRef}>
                  <button
                    type="button"
                    onClick={() => setShowRoomDropdown(v => !v)}
                    className={`${inp} flex items-center justify-between`}
                  >
                    {loadingRooms ? (
                      <span className="flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</span>
                    ) : (
                      <span className="truncate">{selectedRoom ? `${selectedRoom.number}${selectedRoom.room_categories?.description ? " — " + selectedRoom.room_categories.description : ""}` : "Selecione o quarto..."}</span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-1" />
                  </button>
                  {showRoomDropdown && rooms.length > 0 && (
                    <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl overflow-y-auto max-h-48 border ${isDark ? "bg-[#0F172A] border-slate-700" : "bg-white border-slate-200"}`}>
                      {rooms.map(r => (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedRoom(r); setShowRoomDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#0284C7]/20 flex justify-between items-center ${selectedRoom?.id === r.id ? "bg-[#0284C7]/30 text-[#00b4d8]" : txt2}`}
                        >
                          <span><span className="font-bold">{r.number}</span> {r.room_categories?.description || ""}</span>
                          <span className="text-[9px] text-slate-500">{r.room_categories?.name || ""} • {r.floor || "TÉRREO"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className={lbl}>Categoria</label>
                <div className={`${inp} ${txt2}`}>{selectedRoom?.room_categories?.name || "—"}</div>
              </div>

              {/* Local */}
              <div>
                <label className={lbl}>Local/Andar</label>
                <div className={`${inp} ${txt2}`}>{selectedRoom?.floor || "—"}</div>
              </div>
            </div>
          </fieldset>

          {/* ── SEÇÃO 2: HÓSPEDE / PERÍODO / PAGAMENTO ─────────────────── */}
          <fieldset className={fs}>
            <legend className={leg}>2 - Hóspede / Período / Pagamento</legend>

            {/* DOC + NOME + TELEFONE */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              {/* Tipo doc */}
              <div className="sm:col-span-2">
                <label className={lbl}>Tipo Doc.</label>
                <select value={docType} onChange={e => setDocType(e.target.value as any)} className={inp}>
                  <option>CPF</option>
                  <option>CNPJ</option>
                  <option>PASSAPORTE</option>
                </select>
              </div>

              {/* Número doc */}
              <div className="sm:col-span-2">
                <label className={lbl}>{docType}</label>
                <input
                  value={docNumber}
                  onChange={e => {
                    const v = docType === "CPF" ? formatCPF(e.target.value) : docType === "CNPJ" ? formatCNPJ(e.target.value) : e.target.value;
                    setDocNumber(v);
                  }}
                  placeholder={docType === "CPF" ? "000.000.000-00" : docType === "CNPJ" ? "00.000.000/0001-00" : "Passaporte"}
                  className={inp}
                />
              </div>

              {/* Botão buscar Hub */}
              <div className="sm:col-span-1 flex gap-1">
                <button
                  onClick={handleHubSearch}
                  disabled={hubLoading}
                  title="Buscar na API (Hub do Dev)"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-[#0284C7]/20 hover:bg-[#0284C7]/40 border border-[#0284C7]/40 rounded-lg text-[#00b4d8] text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {hubLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => {
                    const q = guestName || docNumber || "";
                    setSearchQuery(q);
                    setShowSearchModal(true);
                    handleSearchGuest(q);
                  }}
                  title="Buscar no Cadastro"
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-[#10B981]/20 hover:bg-[#10B981]/40 border border-[#10B981]/40 rounded-lg text-[#10B981] text-xs font-medium transition-colors"
                >
                  <User className="w-3 h-3" />
                </button>
              </div>

              {/* Nome Hóspede */}
              <div className="sm:col-span-4">
                <label className={lbl}>Nome do Hóspede Principal</label>
                <input value={guestName} onChange={e => setGuestName(e.target.value.toUpperCase())} placeholder="NOME COMPLETO DO HÓSPEDE" className={inp} />
              </div>

              {/* Telefone + Wpp verify */}
              <div className="sm:col-span-3">
                <label className={lbl}>Telefone (Wpp)</label>
                <div className="flex gap-1">
                  <input
                    value={guestPhone}
                    onChange={e => { setGuestPhone(e.target.value); setWppStatus("idle"); }}
                    onBlur={handleVerifyWhatsapp}
                    placeholder="(00) 00000-0000"
                    className={`${inp} flex-1`}
                  />
                  <button onClick={handleVerifyWhatsapp} title="Verificar WhatsApp"
                    className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1 ${
                      wppStatus === "ok" ? "bg-[#10B981]/20 border-[#10B981]/50 text-[#10B981]" :
                      wppStatus === "no" ? "bg-red-500/20 border-red-500/50 text-red-400" :
                      "bg-slate-700/40 border-slate-600 text-slate-400 hover:text-white"
                    }`}>
                    <MessageSquare className="w-3 h-3" />
                    {wppStatus === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> :
                     wppStatus === "ok" ? <CheckCircle2 className="w-3 h-3" /> :
                     wppStatus === "no" ? <AlertCircle className="w-3 h-3" /> : null}
                  </button>
                </div>
                {wppStatus === "ok" && <p className="text-[10px] text-[#10B981] mt-0.5">✓ WhatsApp ativo</p>}
                {wppStatus === "no" && <p className="text-[10px] text-red-400 mt-0.5">✗ Sem WhatsApp</p>}
              </div>
            </div>

            {hubMessage && (
              <p className={`text-[10px] px-2 py-1 rounded ${hubMessage.startsWith("✓") ? "text-[#10B981] bg-[#10B981]/10" : "text-amber-400 bg-amber-400/10"}`}>
                {hubMessage}
              </p>
            )}

            {/* PERÍODO */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-1">
              <div className="col-span-2 sm:col-span-2">
                <CustomDatePicker
                  label="Dt. Chegada"
                  value={dtChegadaLocal}
                  onChange={handleDtChegadaChange}
                  occupiedDates={occupiedDates}
                  minDate={getTodayDateStr()}
                  isDark={isDark}
                  type="datetime-local"
                  defaultTime={defaultCheckInTime || "14:00"}
                />
              </div>
              <div className="col-span-2 sm:col-span-2">
                <CustomDatePicker
                  label="Dt. Saída"
                  value={dtSaidaLocal}
                  onChange={handleDtSaidaChange}
                  occupiedDates={occupiedDates}
                  minDate={dtChegadaLocal ? dtChegadaLocal.split("T")[0] : getTodayDateStr()}
                  isDark={isDark}
                  type="datetime-local"
                  defaultTime={defaultCheckOutTime || "12:00"}
                />
              </div>
              <div>
                <label className={lbl}>Diárias</label>
                <div className={`${inp} font-mono font-bold text-[#00b4d8] text-center`}>{nights}</div>
              </div>
            </div>

            {dateError && <p className="text-red-400 text-[10px]">{dateError}</p>}

            {/* Tabela de Diárias (mini preview) */}
            <div className={`rounded-xl border text-xs overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <div className={`grid grid-cols-4 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-slate-800/70 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                <span>Dt. Reserva</span>
                <span>Dt. Final</span>
                <span>Diária (R$)</span>
                <span className="text-right">Total</span>
              </div>
              <div className="divide-y divide-slate-800/50 max-h-28 overflow-y-auto">
                {buildDailyRows().map((row, i) => (
                  <div key={i} className={`grid grid-cols-4 px-3 py-1 text-[10px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <span>{row.dtReserva}</span>
                    <span>{row.dtFinal}</span>
                    <span>R$ {row.diaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span className="text-right font-semibold text-[#10B981]">R$ {row.diaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Adultos / Crianças */}
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <label className={`text-[10px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Adultos:</label>
                <input type="number" min={1} max={10} value={adults} onChange={e => setAdults(Number(e.target.value))} className={`${inp} w-16 text-center`} />
              </div>
              <div className="flex items-center gap-2">
                <label className={`text-[10px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Crianças:</label>
                <input type="number" min={0} max={10} value={children} onChange={e => setChildren(Number(e.target.value))} className={`${inp} w-16 text-center`} />
              </div>
            </div>

            {/* PAGAMENTOS */}
            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-slate-700/60 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-slate-400" : "text-slate-500"}`}>Pagamento / Adiantamento</p>

              {/* Input row */}
              <div className="grid grid-cols-4 gap-2 items-end">
                <div className="col-span-1">
                  <label className={lbl}>Data/Hora</label>
                  <input value={newPmtDate} onChange={e => setNewPmtDate(e.target.value)} className={inp} />
                </div>
                <div className="col-span-1">
                  <label className={lbl}>Vlr. Adiant.</label>
                  <input
                    value={newPmtAmount}
                    onChange={e => setNewPmtAmount(e.target.value)}
                    className={`${inp} font-mono`}
                    placeholder="0,00"
                  />
                </div>
                <div className="col-span-1">
                  <label className={lbl}>Forma Pagamento</label>
                  <select value={newPmtMethod} onChange={e => setNewPmtMethod(e.target.value)} className={inp}>
                    {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <button onClick={handleAddPayment}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs rounded-lg font-medium transition-colors">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {/* Payments list */}
              {payments.length > 0 && (
                <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <div className={`grid grid-cols-4 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-slate-800/70 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                    <span>Data/Hora</span>
                    <span>Vlr. Adiant.</span>
                    <span>Forma Pagto</span>
                    <span></span>
                  </div>
                  {payments.map(p => (
                    <div key={p.id} className={`grid grid-cols-4 px-3 py-1.5 text-xs items-center ${isDark ? "text-slate-300 border-t border-slate-700/50" : "text-slate-700 border-t border-slate-200"}`}>
                      <span className="text-[10px]">{p.date}</span>
                      <span className="font-mono font-semibold text-[#10B981]">R$ {p.amount.toFixed(2)}</span>
                      <span className="text-[10px]">{p.paymentMethod}</span>
                      <button onClick={() => handleRemovePayment(p.id)} className="flex justify-end text-red-400 hover:text-red-300">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        </div>

        {/* FOOTER — TOTAIS + SALVAR */}
        <div className={`p-4 border-t ${isDark ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Totais */}
            <div className="flex flex-wrap gap-6 text-xs">
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Valor TOTAL diárias</p>
                <p className="font-mono font-bold text-[#0284C7]">R$ {totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Adiant.</p>
                <p className="font-mono font-bold text-[#10B981]">R$ {totalAdiantamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Desconto (R$)</label>
                <input
                  type="number" min={0} value={discount}
                  onChange={e => { setDiscount(Number(e.target.value)); setDiscountPct(0); }}
                  className={`${inp} w-24 font-mono text-center mt-0.5`}
                />
              </div>
              <div className="text-center">
                <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Desconto (%)</label>
                <input
                  type="number" min={0} max={100} value={discountPct}
                  onChange={e => setDiscountPct(Number(e.target.value))}
                  className={`${inp} w-20 font-mono text-center mt-0.5`}
                />
              </div>
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>TOTAL LÍQUIDO</p>
                <p className="font-mono font-bold text-lg text-white bg-[#0284C7] px-3 py-0.5 rounded-lg">
                  R$ {totalLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2">
              <button onClick={onClose} className={`px-4 py-2 rounded-xl border text-xs font-medium transition-colors ${isDark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors shadow-lg"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando..." : "Salvar Reserva"}
                {hasWhatsapp && !saving && <MessageSquare className="w-3 h-3 text-[#10B981]" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEARCH GUEST MODAL ───────────────────────────────────────────────── */}
      {showSearchModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${isDark ? "bg-[#0F172A] border-slate-700" : "bg-white border-slate-200"} border rounded-2xl w-full max-w-md shadow-2xl`}>
            <div className={`px-4 py-3 border-b ${isDark ? "border-slate-700" : "border-slate-200"} flex items-center justify-between`}>
              <span className={`text-sm font-bold ${txt}`}>Buscar Hóspede no Cadastro</span>
              <button onClick={() => setShowSearchModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearchGuest()}
                  placeholder="Nome, CPF ou telefone..."
                  className={inp}
                  autoFocus
                />
                <button onClick={() => handleSearchGuest()} className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs rounded-lg flex items-center gap-1">
                  {searchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
              </div>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {searchResults.length === 0 && !searchLoading && (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado. Digite e pressione Enter.</p>
                )}
                {searchResults.map(g => (
                  <button key={g.id} onClick={() => handleSelectGuest(g)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${isDark ? "hover:bg-slate-800 text-slate-200" : "hover:bg-slate-100 text-slate-700"}`}>
                    <p className="font-semibold">{g.fullName || g.name}</p>
                    <p className="text-slate-400">{g.cpf || g.passport} • {g.phone || g.whatsappPhone}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
