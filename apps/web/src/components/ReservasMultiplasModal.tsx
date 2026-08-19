"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X, Search, Plus, Trash2, Layers, DollarSign, Save,
  CheckCircle2, AlertCircle, MessageSquare, ChevronDown,
  User, Loader2,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { LISTA_TARIFAS, TariffOption } from "@/components/CheckinHospedagemModal";
import { DEFAULT_ROOM_OPTIONS, RoomOption } from "@/components/LancarReservaModal";
import {
  generateReservaPdfBase64,
  PdfReservaDiariaRow,
  PdfReservaPayment,
} from "@/utils/pdfGenerator";
import CustomDatePicker from "@/components/CustomDatePicker";
import { renderWhatsappTemplate } from "@/lib/whatsappMessages";

// ─── Helpers (data local, mesmo padrão do LancarReservaModal) ─────────────────
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
  return `${getTodayDateStr()}T${getNowTimeStr()}`;
}
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
function localToDate(v: string) { return v ? v.split("T")[0] : ""; }

function parseYMD(str: any): { year: number; month: number; day: number } | null {
  if (!str || typeof str !== "string") return null;
  const clean = str.trim();
  let y = 0, m = 0, d = 0;
  if (clean.includes("/")) {
    const [datePart] = clean.split(" ");
    const parts = datePart.split("/");
    if (parts.length === 3) { d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10); }
  } else if (clean.includes("-")) {
    const datePart = clean.split("T")[0].split(" ")[0];
    const parts = datePart.split("-");
    if (parts.length === 3) { y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10); }
  }
  if (y && m && d && !isNaN(y) && !isNaN(m) && !isNaN(d)) return { year: y, month: m, day: d };
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
    const y = cur.getFullYear(); const m = String(cur.getMonth() + 1).padStart(2, "0"); const d = String(cur.getDate()).padStart(2, "0");
    return [`${y}-${m}-${d}`];
  }
  while (cur < last) {
    const y = cur.getFullYear(); const m = String(cur.getMonth() + 1).padStart(2, "0"); const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingReservationRow {
  localId: string;
  roomId: string;
  roomNumber: string;
  roomDescription: string;
  roomCategory: string;
  roomFloor: string;
  tariffId: string;
  tariffName: string;
  dailyRate: number;
  guestName: string;
  guestCpf: string;
  guestPhone: string;
  guestId: string | null;
  hasWhatsapp: boolean;
  checkInDate: string; // ISO
  checkOutDate: string; // ISO
  nights: number;
  totalDiarias: number;
  adults: number;
  children: number;
  depositPaid: number;
  paymentMethod: string;
}

export interface ReservasMultiplasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tenantId?: string;
  operatorName?: string;
  cashRegisterId?: string;
  existingReservations?: any[];
}

const PAYMENT_METHODS = ["DINHEIRO", "CARTÃO", "PIX", "FATURA", "SALDO DE CLIENTE", "TRANSF.DÉBITO"];

// ═══════════════════════════════════════════════════════════════════════════════
export default function ReservasMultiplasModal({
  isOpen,
  onClose,
  onSuccess,
  tenantId = "TNT-01",
  operatorName = "RECEPÇÃO",
  cashRegisterId,
  existingReservations = [],
}: ReservasMultiplasModalProps) {
  const { theme, hotelName, defaultCheckInTime, defaultCheckOutTime } = useTheme();
  const toast = useToast();
  const isDark = theme.isDark;

  // ── Tarifa / Quarto ─────────────────────────────────────────────────────────
  const [tariffs, setTariffs] = useState<TariffOption[]>(LISTA_TARIFAS);
  const [selectedTariff, setSelectedTariff] = useState<TariffOption>(LISTA_TARIFAS[2]);
  const [showTariffDropdown, setShowTariffDropdown] = useState(false);
  const tariffRef = useRef<HTMLDivElement>(null);

  const [rooms, setRooms] = useState<RoomOption[]>(DEFAULT_ROOM_OPTIONS);
  const [selectedRoom, setSelectedRoom] = useState<RoomOption | null>(null);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [adults, setAdults] = useState(selectedTariff?.pax || 1);
  const [children, setChildren] = useState(0);

  // ── Hóspede ─────────────────────────────────────────────────────────────────
  const [guestName, setGuestName] = useState("");
  const [guestCpf, setGuestCpf] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [hasWhatsapp, setHasWhatsapp] = useState(false);
  const [wppStatus, setWppStatus] = useState<"idle" | "ok" | "no" | "loading">("idle");

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Período ─────────────────────────────────────────────────────────────────
  const [dtChegadaLocal, setDtChegadaLocal] = useState(nowLocalMin);
  const [dtSaidaLocal, setDtSaidaLocal] = useState(() => `${tomorrowStr()}T${defaultCheckOutTime || "12:00"}`);
  const [dateError, setDateError] = useState<string | null>(null);
  const [nights, setNights] = useState(1);

  // ── Adiantamento do rascunho atual ─────────────────────────────────────────
  const [draftAdiant, setDraftAdiant] = useState("0,00");
  const [draftAdiantMethod, setDraftAdiantMethod] = useState("DINHEIRO");

  // ── Lote de reservas incluídas (equivalente a Table_Reservas do WinDev) ────
  const [pendingReservations, setPendingReservations] = useState<PendingReservationRow[]>([]);
  const [batchDiscount, setBatchDiscount] = useState(0);

  const [saving, setSaving] = useState(false);

  const dtChegada = dtChegadaLocal;
  const dtSaida = dtSaidaLocal;

  // Sincronizar adultos com a capacidade padrão da tarifa
  useEffect(() => {
    if (selectedTariff && selectedTariff.pax) setAdults(selectedTariff.pax);
  }, [selectedTariff]);

  // Recalcular diárias (noites)
  useEffect(() => {
    try {
      const d1 = new Date(dtChegadaLocal);
      const d2 = new Date(dtSaidaLocal);
      const diff = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000));
      setNights(diff);
    } catch { setNights(1); }
  }, [dtChegadaLocal, dtSaidaLocal]);

  // Carregar quartos
  useEffect(() => {
    if (!isOpen) return;
    setLoadingRooms(true);
    fetch(`/api/reservations/rooms?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.rooms && data.rooms.length > 0) setRooms(data.rooms);
        else setRooms(DEFAULT_ROOM_OPTIONS);
      })
      .catch(() => setRooms(DEFAULT_ROOM_OPTIONS))
      .finally(() => setLoadingRooms(false));
  }, [isOpen, tenantId]);

  // Carregar tarifas
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

  // Reset completo ao abrir a tela
  useEffect(() => {
    if (!isOpen) return;
    setPendingReservations([]);
    setBatchDiscount(0);
    resetDraft();
  }, [isOpen]);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tariffRef.current && !tariffRef.current.contains(e.target as Node)) setShowTariffDropdown(false);
      if (roomRef.current && !roomRef.current.contains(e.target as Node)) setShowRoomDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Datas ocupadas do quarto selecionado (reservas já gravadas + já incluídas no lote) ────
  const occupiedDates = React.useMemo(() => {
    if (!selectedRoom) return [];
    const targetId = String(selectedRoom.id || "").trim().toLowerCase();
    const targetNum = String(selectedRoom.number || "").trim().toLowerCase();
    const dateSet = new Set<string>();

    (existingReservations || []).forEach((r: any) => {
      if (!r || r.status === "CANCELLED") return;
      const rRoomId = String(r.roomId || r.room_id || "").trim().toLowerCase();
      const rRoomNum = String(r.roomNumber || r.room_number || (r.rooms && r.rooms.number) || "").trim().toLowerCase();
      const isMatch = (targetNum && (rRoomNum === targetNum || rRoomId === targetNum)) || (targetId && (rRoomId === targetId || rRoomNum === targetId));
      if (isMatch) {
        const startStr = r.checkInDate || r.check_in_date;
        const endStr = r.checkOutDate || r.check_out_date;
        if (startStr && endStr) getOccupiedDatesFromRange(startStr, endStr).forEach(d => dateSet.add(d));
      }
    });

    pendingReservations.forEach((r) => {
      if (r.roomId === selectedRoom.id || r.roomNumber === selectedRoom.number) {
        getOccupiedDatesFromRange(r.checkInDate, r.checkOutDate).forEach(d => dateSet.add(d));
      }
    });

    return Array.from(dateSet);
  }, [selectedRoom, existingReservations, pendingReservations]);

  if (!isOpen) return null;

  // ─── Handlers de data ──────────────────────────────────────────────────────
  const handleDtChegadaChange = (v: string) => {
    if (!v) return;
    const todayStr = getTodayDateStr();
    const selectedDate = v.split("T")[0];
    if (selectedDate < todayStr) {
      setDateError("Data de chegada não pode ser anterior à data de hoje.");
      return;
    }
    setDateError(null);
    let finalDateTime = v;
    if (selectedDate === todayStr) {
      finalDateTime = `${todayStr}T${getNowTimeStr()}`;
    } else {
      finalDateTime = `${selectedDate}T${defaultCheckInTime || "14:00"}`;
    }
    setDtChegadaLocal(finalDateTime);
    const outD = localToDate(dtSaidaLocal);
    if (outD <= selectedDate) {
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
    setDtSaidaLocal(`${outD}T${defaultCheckOutTime || "12:00"}`);
  };

  // ─── WhatsApp ──────────────────────────────────────────────────────────────
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
      setWppStatus(clean.length >= 11 ? "ok" : "no");
      setHasWhatsapp(clean.length >= 11);
    }
  };

  // ─── Busca de hóspede no cadastro ──────────────────────────────────────────
  const handleSearchGuest = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/cadastros/hospedes?q=${encodeURIComponent(q)}&tenantId=${tenantId}`);
      const data = await res.json();
      setSearchResults(data.guests || (Array.isArray(data) ? data : []));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectGuest = (g: any) => {
    setGuestName((g.fullName || g.name || "").toUpperCase());
    setGuestCpf(g.cpf || "");
    setGuestPhone(g.whatsappPhone || g.phone || "");
    setHasWhatsapp(g.hasWhatsapp || false);
    setWppStatus(g.hasWhatsapp ? "ok" : "no");
    setGuestId(g.id || null);
    setShowSearchModal(false);
  };

  // ─── Cálculos do rascunho atual ────────────────────────────────────────────
  const totalDiariasDraft = nights * (selectedTariff?.price || 0);
  const draftAdiantAmount = parseFloat(draftAdiant.replace(/\./g, "").replace(",", ".")) || 0;
  const saldoDraft = Math.max(0, totalDiariasDraft - draftAdiantAmount);

  function buildDailyRows(): PdfReservaDiariaRow[] {
    const rows: PdfReservaDiariaRow[] = [];
    try {
      const d1 = new Date(dtChegadaLocal.split("T")[0]);
      for (let i = 0; i < nights; i++) {
        const start = new Date(d1); start.setDate(d1.getDate() + i);
        const end = new Date(start); end.setDate(start.getDate() + 1);
        const fmt = (d: Date) => { const pad = (n: number) => (n < 10 ? "0" + n : String(n)); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
        rows.push({ dtReserva: fmt(start), dtFinal: fmt(end), diaria: selectedTariff?.price || 0 });
      }
    } catch {}
    return rows;
  }

  function resetDraft() {
    setSelectedRoom(null);
    setGuestName("");
    setGuestCpf("");
    setGuestPhone("");
    setGuestId(null);
    setHasWhatsapp(false);
    setWppStatus("idle");
    setDraftAdiant("0,00");
    setDraftAdiantMethod("DINHEIRO");
    setDateError(null);
    const inDate = getTodayDateStr();
    setDtChegadaLocal(`${inDate}T${defaultCheckInTime || "14:00"}`);
    const startDateObj = new Date(inDate);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(startDateObj.getDate() + 1);
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    setDtSaidaLocal(`${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())}T${defaultCheckOutTime || "12:00"}`);
  }

  // ─── Verifica conflito de quarto/data contra reservas gravadas + lote atual ─
  function findConflict(roomId: string, roomNumber: string, checkInISO: string, checkOutISO: string): string | null {
    const newStart = new Date(checkInISO).getTime();
    const newEnd = new Date(checkOutISO).getTime();

    for (const r of existingReservations || []) {
      if (!r || r.status === "CANCELLED" || r.status === "CHECKED_OUT") continue;
      const rRoomId = String(r.roomId || r.room_id || "");
      const rRoomNum = String((r.rooms && r.rooms.number) || r.roomNumber || "");
      if (rRoomId !== roomId && rRoomNum !== roomNumber) continue;
      const s = new Date(r.checkInDate || r.check_in_date).getTime();
      const e = new Date(r.checkOutDate || r.check_out_date).getTime();
      if (isNaN(s) || isNaN(e)) continue;
      if (newStart < e && newEnd > s) {
        return `⚠️ O Quarto ${roomNumber} já possui a reserva "${r.guestName}" sobrepondo esse período.`;
      }
    }

    for (const r of pendingReservations) {
      if (r.roomId !== roomId && r.roomNumber !== roomNumber) continue;
      const s = new Date(r.checkInDate).getTime();
      const e = new Date(r.checkOutDate).getTime();
      if (newStart < e && newEnd > s) {
        return `⚠️ O Quarto ${roomNumber} já foi incluído neste lote para "${r.guestName}" em período que se sobrepõe.`;
      }
    }

    return null;
  }

  // ─── Incluir reserva no lote (não grava no banco ainda) ────────────────────
  const handleIncluir = () => {
    if (!selectedRoom) { toast.error("Selecione um quarto."); return; }
    if (!selectedTariff) { toast.error("Selecione uma tarifa."); return; }
    if (!guestName.trim()) { toast.error("Informe o nome do hóspede principal."); return; }
    if (dateError) { toast.error(dateError); return; }

    const todayStr = getTodayDateStr();
    if (localToDate(dtChegadaLocal) < todayStr) {
      toast.error("Data de chegada não pode ser anterior à data de hoje.");
      return;
    }

    const checkInISO = new Date(dtChegadaLocal).toISOString();
    const checkOutISO = new Date(dtSaidaLocal).toISOString();

    const conflictReason = findConflict(selectedRoom.id, selectedRoom.number, checkInISO, checkOutISO);
    if (conflictReason) { toast.error(conflictReason); return; }

    const newRow: PendingReservationRow = {
      localId: crypto.randomUUID(),
      roomId: selectedRoom.id,
      roomNumber: selectedRoom.number,
      roomDescription: selectedRoom.room_categories?.description || "",
      roomCategory: selectedRoom.room_categories?.name || "",
      roomFloor: selectedRoom.floor || "",
      tariffId: selectedTariff.id,
      tariffName: selectedTariff.name,
      dailyRate: selectedTariff.price,
      guestName: guestName.toUpperCase(),
      guestCpf,
      guestPhone,
      guestId,
      hasWhatsapp,
      checkInDate: checkInISO,
      checkOutDate: checkOutISO,
      nights,
      totalDiarias: totalDiariasDraft,
      adults,
      children,
      depositPaid: draftAdiantAmount,
      paymentMethod: draftAdiantMethod,
    };

    setPendingReservations(prev => [...prev, newRow]);
    toast.success(`Reserva de ${newRow.guestName} incluída no lote (Quarto ${newRow.roomNumber}).`);
    resetDraft();
  };

  const handleRemovePending = (localId: string) => {
    setPendingReservations(prev => prev.filter(r => r.localId !== localId));
  };

  // ─── Totais do lote ─────────────────────────────────────────────────────────
  const batchTotalDiarias = pendingReservations.reduce((s, r) => s + r.totalDiarias, 0);
  const batchTotalAdiant = pendingReservations.reduce((s, r) => s + r.depositPaid, 0);
  const batchSaldo = Math.max(0, batchTotalDiarias - batchDiscount - batchTotalAdiant);

  // ─── Salvar todas as reservas do lote de uma vez (transação única no backend) ─
  const handleSalvarReservas = async () => {
    if (pendingReservations.length === 0) { toast.error("Inclua ao menos uma reserva no lote antes de salvar."); return; }

    setSaving(true);
    try {
      const payload = {
        tenantId,
        cashRegisterId: cashRegisterId || null,
        operatorName,
        reservations: pendingReservations.map(r => ({
          roomId: r.roomId,
          tariffId: r.tariffId,
          tariffName: r.tariffName,
          guestName: r.guestName,
          guestCpf: r.guestCpf || null,
          guestPhone: r.guestPhone || null,
          guestId: r.guestId,
          checkInDate: r.checkInDate,
          checkOutDate: r.checkOutDate,
          dailyRate: r.dailyRate,
          totalDiarias: r.totalDiarias,
          discountAmount: 0,
          totalAmount: r.totalDiarias,
          depositPaid: r.depositPaid,
          adults: r.adults,
          children: r.children,
          hasWhatsapp: r.hasWhatsapp,
          roomDescription: r.roomDescription,
          roomCategory: r.roomCategory,
          roomFloor: r.roomFloor,
          payments: r.depositPaid > 0 ? [{ amount: r.depositPaid, paymentMethod: r.paymentMethod }] : [],
        })),
      };

      const res = await fetch("/api/reservations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: any = {};
      try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { success: false, error: rawText }; }

      if (!data.success) {
        toast.error(data.error || "Erro ao salvar as reservas do lote.");
        setSaving(false);
        return;
      }

      toast.success(`${pendingReservations.length} reserva(s) salva(s) com sucesso!`);

      // Gera e imprime o voucher de cada reserva do lote, e envia por WhatsApp quando aplicável
      // (respeitando o toggle "Confirmação de reserva" de Configurações > Mensagens de WhatsApp).
      let waReservaEnabled = true;
      let waReservaMessage = "";
      try {
        const waRes = await fetch("/api/tenant/whatsapp-messages");
        const waData = await waRes.json();
        if (waData.success && waData.settings) {
          waReservaEnabled = !!waData.settings.reservationConfirmEnabled;
          waReservaMessage = waData.settings.reservationConfirmMessage || "";
        }
      } catch {
        // Se a consulta falhar, mantém o comportamento padrão (habilitado) para não travar o lote.
      }

      const createdList: any[] = data.reservations || [];
      pendingReservations.forEach((r, idx) => {
        const created = createdList[idx];
        const reservationNumber = created?.reservationNumber || "";

        const d1 = new Date(r.checkInDate);
        const dailyRows: PdfReservaDiariaRow[] = [];
        for (let i = 0; i < r.nights; i++) {
          const start = new Date(d1); start.setDate(d1.getDate() + i);
          const end = new Date(start); end.setDate(start.getDate() + 1);
          const fmt = (d: Date) => { const pad = (n: number) => (n < 10 ? "0" + n : String(n)); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
          dailyRows.push({ dtReserva: fmt(start), dtFinal: fmt(end), diaria: r.dailyRate });
        }

        const pdfBase64 = generateReservaPdfBase64({
          hotelName: hotelName || "HOTEL IDEAL",
          reservationNumber,
          issueDate: nowBrDisplay(),
          roomNumber: r.roomNumber,
          roomDescription: r.roomDescription,
          roomCategory: r.roomCategory,
          roomFloor: r.roomFloor || "TÉRREO",
          guestName: r.guestName,
          guestCpf: r.guestCpf,
          guestPhone: r.guestPhone,
          checkInDate: brDate(r.checkInDate) + " " + new Date(r.checkInDate).toTimeString().slice(0, 5),
          checkOutDate: brDate(r.checkOutDate) + " " + new Date(r.checkOutDate).toTimeString().slice(0, 5),
          tariffName: r.tariffName,
          adults: r.adults,
          children: r.children,
          dailyRows,
          payments: (r.depositPaid > 0 ? [{ paymentDate: nowBrDisplay(), amount: r.depositPaid, paymentMethod: r.paymentMethod }] : []) as PdfReservaPayment[],
          totals: { totalDiarias: r.totalDiarias, totalAdiantamento: r.depositPaid, desconto: 0, totalLiquido: Math.max(0, r.totalDiarias - r.depositPaid) },
        });

        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = pdfBase64;
        document.body.appendChild(iframe);
        iframe.onload = () => { setTimeout(() => { iframe.contentWindow?.print(); }, 400 + idx * 200); };

        if (r.hasWhatsapp && r.guestPhone && waReservaEnabled) {
          const caption = waReservaMessage
            ? renderWhatsappTemplate(waReservaMessage, { hospede: r.guestName, hotel: hotelName || "" })
            : `Segue confirmação da reserva para ${r.guestName} no período: checkin: ${brDate(r.checkInDate)} a checkout: ${brDate(r.checkOutDate)}`;
          fetch("/api/uazapi/send-reserva", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: r.guestPhone,
              caption,
              pdfBase64: pdfBase64.replace(/^data:application\/pdf;base64,/, ""),
              filename: `Confirmacao_Reserva_${reservationNumber}.pdf`,
              guestName: r.guestName,
            }),
          }).catch(() => {});
        }
      });

      onSuccess?.();
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
    ? "bg-[#0F172A] border border-slate-700/80 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]"
    : "bg-white border border-slate-200 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]";
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
            <Layers className="w-4 h-4 text-[#00b4d8]" />
            <span className={`text-sm font-bold ${txt}`}>Reservas Múltiplas</span>
            <span className="text-[10px] text-slate-400 font-mono">— Inclua quantas reservas quiser na grade e só então clique em Salvar Reservas</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* BODY — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ── DADOS PARA A PRÓXIMA RESERVA (rascunho) ─────────────────────── */}
          <fieldset className={fs}>
            <legend className={leg}>Dados para a Próxima Reserva</legend>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              {/* Tarifa */}
              <div className="sm:col-span-3">
                <label className={lbl}>Tarifa</label>
                <div className="relative" ref={tariffRef}>
                  <button type="button" onClick={() => setShowTariffDropdown(v => !v)} className={`${inp} flex items-center justify-between font-medium`}>
                    <span className="truncate">
                      {selectedTariff ? `${selectedTariff.name} • ${selectedTariff.pax || 1} ${(selectedTariff.pax || 1) === 1 ? "Adulto" : "Adultos"} • R$ ${selectedTariff.price.toFixed(2)}` : "Selecione a tarifa..."}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-1" />
                  </button>
                  {showTariffDropdown && (
                    <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl overflow-y-auto max-h-52 border divide-y ${isDark ? "bg-[#0F172A] border-slate-700 divide-slate-800" : "bg-white border-slate-200 divide-slate-100"}`}>
                      {tariffs.map(t => (
                        <button key={t.id} onClick={() => { setSelectedTariff(t); setShowTariffDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#0284C7]/20 flex items-center justify-between gap-2 ${t.id === selectedTariff?.id ? "bg-[#0284C7]/30 text-[#00b4d8] font-bold" : txt2}`}>
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="truncate">{t.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 bg-sky-500/15 text-sky-400 border border-sky-500/30">{t.pax || 1} {(t.pax || 1) === 1 ? "Adulto" : "Adultos"}</span>
                          </div>
                          <span className="font-mono font-bold text-[#10B981] shrink-0">R$ {t.price.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Valor diária */}
              <div className="sm:col-span-1">
                <label className={lbl}>Valor Diária (R$)</label>
                <div className={`${inp} font-mono font-bold text-[#10B981] flex items-center gap-1`}>
                  <DollarSign className="w-3 h-3" />{(selectedTariff?.price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Adultos */}
              <div className="sm:col-span-1">
                <label className={lbl}>Adultos</label>
                <input type="number" min={1} max={10} value={adults} onChange={e => setAdults(Number(e.target.value))} className={`${inp} text-center`} />
              </div>

              {/* Crianças */}
              <div className="sm:col-span-1">
                <label className={lbl}>Crianças</label>
                <input type="number" min={0} max={10} value={children} onChange={e => setChildren(Number(e.target.value))} className={`${inp} text-center`} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              {/* Quarto */}
              <div className="sm:col-span-3">
                <label className={lbl}>Quarto</label>
                <div className="relative" ref={roomRef}>
                  <button type="button" onClick={() => setShowRoomDropdown(v => !v)} className={`${inp} flex items-center justify-between`}>
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
                        <button key={r.id} onClick={() => { setSelectedRoom(r); setShowRoomDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-[#0284C7]/20 flex justify-between items-center ${selectedRoom?.id === r.id ? "bg-[#0284C7]/30 text-[#00b4d8]" : txt2}`}>
                          <span><span className="font-bold">{r.number}</span> {r.room_categories?.description || ""}</span>
                          <span className="text-[9px] text-slate-500">{r.room_categories?.name || ""} • {r.floor || "TÉRREO"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className={lbl}>Categoria</label>
                <div className={`${inp} ${txt2}`}>{selectedRoom?.room_categories?.name || "—"}</div>
              </div>
              <div className="sm:col-span-1">
                <label className={lbl}>Local/Andar</label>
                <div className={`${inp} ${txt2}`}>{selectedRoom?.floor || "—"}</div>
              </div>

              <div className="sm:col-span-2">
                <div className="grid grid-cols-2 gap-2">
                  <CustomDatePicker label="Dt. Chegada" value={dtChegadaLocal} onChange={handleDtChegadaChange} occupiedDates={occupiedDates} minDate={getTodayDateStr()} isDark={isDark} type="datetime-local" defaultTime={defaultCheckInTime || "14:00"} />
                  <CustomDatePicker label="Dt. Saída" value={dtSaidaLocal} onChange={handleDtSaidaChange} occupiedDates={occupiedDates} minDate={dtChegadaLocal ? dtChegadaLocal.split("T")[0] : getTodayDateStr()} isDark={isDark} type="datetime-local" defaultTime={defaultCheckOutTime || "12:00"} />
                </div>
              </div>
            </div>

            {dateError && <p className="text-red-400 text-[10px]">{dateError}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-4">
                <label className={lbl}>Nome do Hóspede Principal</label>
                <div className="flex gap-1">
                  <input value={guestName} onChange={e => setGuestName(e.target.value.toUpperCase())} placeholder="NOME COMPLETO DO HÓSPEDE" className={inp} />
                  <button onClick={() => { const q = guestName || ""; setSearchQuery(q); setShowSearchModal(true); handleSearchGuest(q); }} title="Buscar no Cadastro"
                    className="px-2 py-1.5 bg-[#10B981]/20 hover:bg-[#10B981]/40 border border-[#10B981]/40 rounded-lg text-[#10B981] transition-colors">
                    <User className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className={lbl}>No. Telefone (Wpp)</label>
                <div className="flex gap-1">
                  <input value={guestPhone} onChange={e => { setGuestPhone(e.target.value); setWppStatus("idle"); }} onBlur={handleVerifyWhatsapp} placeholder="(00) 00000-0000" className={`${inp} flex-1`} />
                  <button onClick={handleVerifyWhatsapp} title="Verificar WhatsApp"
                    className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1 ${
                      wppStatus === "ok" ? "bg-[#10B981]/20 border-[#10B981]/50 text-[#10B981]" :
                      wppStatus === "no" ? "bg-red-500/20 border-red-500/50 text-red-400" :
                      "bg-slate-700/40 border-slate-600 text-slate-400 hover:text-white"
                    }`}>
                    <MessageSquare className="w-3 h-3" />
                    {wppStatus === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : wppStatus === "ok" ? <CheckCircle2 className="w-3 h-3" /> : wppStatus === "no" ? <AlertCircle className="w-3 h-3" /> : null}
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={lbl}>Adiant. (R$)</label>
                <input value={draftAdiant} onChange={e => setDraftAdiant(e.target.value)} className={`${inp} font-mono`} placeholder="0,00" />
              </div>
              <div className="sm:col-span-3">
                <label className={lbl}>Forma Pgto Adiant.</label>
                <select value={draftAdiantMethod} onChange={e => setDraftAdiantMethod(e.target.value)} className={inp}>
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Preview diárias + totais + Incluir */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
              <div className={`lg:col-span-2 rounded-xl border text-xs overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                <div className={`grid grid-cols-4 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-slate-800/70 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  <span>Dt. Reserva</span><span>Dt. Final</span><span>Diária (R$)</span><span className="text-right">Total</span>
                </div>
                <div className="divide-y divide-slate-800/50 max-h-24 overflow-y-auto">
                  {buildDailyRows().map((row, i) => (
                    <div key={i} className={`grid grid-cols-4 px-3 py-1 text-[10px] ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      <span>{row.dtReserva}</span><span>{row.dtFinal}</span>
                      <span>R$ {row.diaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-right font-semibold text-[#10B981]">R$ {row.diaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="grid grid-cols-3 gap-2 flex-1 text-center">
                  <div>
                    <p className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Vlr. Diárias</p>
                    <p className="font-mono font-bold text-[#0284C7] text-xs">R$ {totalDiariasDraft.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Adiant.</p>
                    <p className="font-mono font-bold text-[#10B981] text-xs">R$ {draftAdiantAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Saldo</p>
                    <p className="font-mono font-bold text-xs text-amber-400">R$ {saldoDraft.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <button onClick={handleIncluir} className="flex items-center gap-1.5 px-4 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold rounded-xl transition-colors shadow-lg shrink-0">
                  <Plus className="w-4 h-4" /> Incluir
                </button>
              </div>
            </div>
          </fieldset>

          {/* ── GRADE DE RESERVAS INCLUÍDAS NO LOTE ──────────────────────────── */}
          <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <div className={`px-3 py-2 flex items-center justify-between ${isDark ? "bg-slate-800/70" : "bg-slate-100"}`}>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Reservas no Lote ({pendingReservations.length})
              </span>
            </div>
            <div className={`grid grid-cols-9 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-slate-900/60 text-slate-400" : "bg-slate-50 text-slate-500"}`}>
              <span>Dt. Checking</span><span>Dt. Checkout</span><span className="col-span-2">Tarifa</span><span>Quarto</span>
              <span className="col-span-2">Hóspede Principal</span><span className="text-right">Vlr. Diária</span><span className="text-right">Valor Total</span>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/50">
              {pendingReservations.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-6">Nenhuma reserva incluída ainda. Preencha os dados acima e clique em &quot;Incluir&quot;.</p>
              ) : (
                pendingReservations.map(r => (
                  <div key={r.localId} className={`grid grid-cols-9 px-3 py-1.5 text-xs items-center group ${isDark ? "text-slate-300 hover:bg-slate-800/40" : "text-slate-700 hover:bg-slate-50"}`}>
                    <span className="text-[10px] font-mono">{brDate(r.checkInDate)}</span>
                    <span className="text-[10px] font-mono">{brDate(r.checkOutDate)}</span>
                    <span className="col-span-2 truncate">{r.tariffName}</span>
                    <span className="font-bold">{r.roomNumber}</span>
                    <span className="col-span-2 truncate">{r.guestName}</span>
                    <span className="text-right font-mono">R$ {r.dailyRate.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    <span className="text-right font-mono font-semibold text-[#10B981] flex items-center justify-end gap-2">
                      R$ {r.totalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      <button onClick={() => handleRemovePending(r.localId)} title="Remover do lote" className="text-red-400 hover:text-red-300 opacity-60 group-hover:opacity-100">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* FOOTER — TOTAIS DO LOTE + SALVAR */}
        <div className={`p-4 border-t ${isDark ? "border-slate-700 bg-slate-900/70" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-6 text-xs">
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Valor Diárias (R$)</p>
                <p className="font-mono font-bold text-[#0284C7]">R$ {batchTotalDiarias.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Adiant. (R$)</p>
                <p className="font-mono font-bold text-[#10B981]">R$ {batchTotalAdiant.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-center">
                <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Desconto (R$)</label>
                <input type="number" min={0} value={batchDiscount} onChange={e => setBatchDiscount(Number(e.target.value))} className={`${inp} w-24 font-mono text-center mt-0.5`} />
              </div>
              <div className="text-center">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>SALDO (R$)</p>
                <p className="font-mono font-bold text-lg text-white bg-[#0284C7] px-3 py-0.5 rounded-lg">R$ {batchSaldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className={`px-4 py-2 rounded-xl border text-xs font-medium transition-colors ${isDark ? "border-slate-600 text-slate-300 hover:bg-slate-700" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                Cancelar
              </button>
              <button onClick={handleSalvarReservas} disabled={saving || pendingReservations.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors shadow-lg">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando..." : `Salvar Reservas (${pendingReservations.length})`}
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
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearchGuest()} placeholder="Nome, CPF ou telefone..." className={inp} autoFocus />
                <button onClick={() => handleSearchGuest()} className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs rounded-lg flex items-center gap-1">
                  {searchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
              </div>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {searchResults.length === 0 && !searchLoading && (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhum resultado. Digite e pressione Enter.</p>
                )}
                {searchResults.map(g => (
                  <button key={g.id} onClick={() => handleSelectGuest(g)} className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${isDark ? "hover:bg-slate-800 text-slate-200" : "hover:bg-slate-100 text-slate-700"}`}>
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
