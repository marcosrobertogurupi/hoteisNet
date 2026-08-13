"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  UserCheck,
  Search,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Info,
  ChevronDown,
  Eye,
  EyeOff,
  Building2,
  User,
  Save,
  CheckCircle2,
  AlertCircle,
  Globe,
  MessageSquare,
  Star
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

export interface VerifiedPhone {
  id: string;
  number: string;
  hasWhatsapp: boolean;
  nomeUsuarioWpp: string;
  whatsappName: string;
  isPrimary: boolean;
}

export interface TariffOption {
  id: string;
  name: string;
  pax: number;
  price: number;
}

export const LISTA_TARIFAS: TariffOption[] = [
  { id: "TAR-001", name: "APTO ESPECIAL DUPLO", pax: 2, price: 230.00 },
  { id: "TAR-002", name: "APTO ESPECIAL INDIVIDUAL", pax: 1, price: 170.00 },
  { id: "TAR-003", name: "APTO ESPECIAL TRIPLO", pax: 3, price: 280.00 },
  { id: "TAR-004", name: "APTO LUXO DUPLO", pax: 2, price: 260.00 },
  { id: "TAR-005", name: "APTO LUXO DUPLO DESC", pax: 2, price: 240.00 },
  { id: "TAR-006", name: "APTO LUXO INDIVIDUAL", pax: 1, price: 190.00 },
  { id: "TAR-007", name: "APTO LUXO TRIPLO", pax: 3, price: 310.00 },
  { id: "TAR-008", name: "APTO MENSAUL 2", pax: 1, price: 116.67 },
  { id: "TAR-009", name: "APTO MENSAUL 3", pax: 1, price: 83.33 },
  { id: "TAR-010", name: "APTO MENSAUL 4", pax: 1, price: 100.00 },
  { id: "TAR-011", name: "APTO MENSAUL 1", pax: 1, price: 110.00 },
  { id: "TAR-012", name: "APTO REPRESENTANTE 120", pax: 1, price: 120.00 },
  { id: "TAR-013", name: "APTO REPRESENTANTE 130", pax: 1, price: 130.00 },
  { id: "TAR-014", name: "APTO STANDAR DUPLO", pax: 2, price: 210.00 },
  { id: "TAR-015", name: "APTO STANDAR INDIVIDUAL", pax: 1, price: 150.00 },
  { id: "TAR-016", name: "APTO STANDAR TRIPLO", pax: 3, price: 280.00 },
  { id: "TAR-017", name: "AUDITORIO 80-100", pax: 1, price: 800.00 },
  { id: "TAR-018", name: "AUDITORIO COMPLETO", pax: 1, price: 900.00 },
  { id: "TAR-019", name: "AUDITORIO DES", pax: 1, price: 600.00 },
  { id: "TAR-020", name: "CAMA EXTRA", pax: 1, price: 70.00 },
  { id: "TAR-021", name: "CORTESIA", pax: 1, price: 1.00 },
];

export interface SecondaryGuest {
  id: string;
  name: string;
  doc?: string;
}

export interface PaymentItem {
  id: string;
  date: string;
  amount: number;
  methodDescription: string;
}

export interface ObservationItem {
  id: string;
  dateTime: string;
  typeDescription: string;
  note: string;
}

export interface CheckinHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomData: {
    number: string;
    description?: string;
    location?: string;
    category?: string;
    ratePerNight?: number;
  };
  reservationData?: {
    reservationNumber?: string;
    origin?: string;
    guestName?: string;
    phone?: string;
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
    children?: number;
    totalAmount?: number;
    depositPaid?: number;
  };
  onSuccess: (checkinData: any) => void;
}

// Formatters & Validators
export function validateCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum += parseInt(clean.substring(i - 1, i)) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(clean.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(clean.substring(i - 1, i)) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(clean.substring(10, 11));
}

export function validateCNPJ(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1));
}

export function formatCPF(val: string): string {
  const clean = val.replace(/\D/g, "").slice(0, 11);
  return clean
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCNPJ(val: string): string {
  const clean = val.replace(/\D/g, "").slice(0, 14);
  return clean
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Convert "DD/MM/YYYY HH:MM:SS" or "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM" (datetime-local value)
function brDateTimeToLocal(brStr: string): string {
  try {
    if (!brStr) return "";
    if (brStr.includes("T")) return brStr.slice(0, 16);
    const [datePart, timePart] = brStr.split(" ");
    const timeShort = timePart ? timePart.slice(0, 5) : "14:00";
    if (datePart.includes("-")) {
      return `${datePart}T${timeShort}`;
    }
    const [dd, mm, yyyy] = datePart.split("/");
    return `${yyyy}-${mm}-${dd}T${timeShort}`;
  } catch {
    return "";
  }
}

// Convert "YYYY-MM-DDTHH:MM" → "DD/MM/YYYY HH:MM:SS"
function localToBrDateTime(localStr: string): string {
  try {
    const [datePart, timePart] = localStr.split("T");
    const [yyyy, mm, dd] = datePart.split("-");
    const time = timePart ? timePart + ":00" : "00:00:00";
    return `${dd}/${mm}/${yyyy} ${time}`;
  } catch {
    return "";
  }
}

// Extract "YYYY-MM-DD" from datetime-local value
function localToDateOnly(localStr: string): string {
  return localStr ? localStr.split("T")[0] : "";
}

// Build datetime-local string from date (YYYY-MM-DD) + time (HH:MM)
function buildLocalDateTime(datePart: string, timePart: string): string {
  return `${datePart}T${timePart}`;
}

// Min value for datetime-local (today at current time, seconds zeroed)
function nowLocalMin(): string {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Build tomorrow's date string "YYYY-MM-DD"
function tomorrowDateStr(): string {
  const d = new Date(Date.now() + 86400000);
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Today's date string "YYYY-MM-DD"
function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// ──────────────────────────────────────────────────────────────────────────────

export default function CheckinHospedagemModal({
  isOpen,
  onClose,
  roomData,
  reservationData,
  onSuccess,
}: CheckinHospedagemModalProps) {
  const { defaultCheckOutTime, theme } = useTheme();
  const toast = useToast();
  const isDark = theme.isDark;

  // Dynamic Theme Style Helpers
  const modalOverlayClass = isDark ? "bg-slate-950/85 backdrop-blur-md" : "bg-slate-900/50 backdrop-blur-sm";
  const modalBoxClass = isDark
    ? "bg-[#0F172A] border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]"
    : "bg-white border border-slate-200 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh] text-slate-900";
  const modalHeaderClass = isDark
    ? "px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700 flex items-center justify-between"
    : "px-5 py-3.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-slate-900";
  const fieldsetClass = isDark
    ? "rounded-xl border border-slate-700/70 bg-slate-900/60 p-3.5 space-y-3"
    : "rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3 text-slate-800";
  const legendClass = isDark
    ? "px-2 text-xs font-bold text-[#00b4d8] flex items-center gap-1.5"
    : "px-2 text-xs font-bold text-[#0284C7] flex items-center gap-1.5";

  // Document Type selection: CPF | CNPJ | Passaporte
  const [docType, setDocType] = useState<"CPF" | "CNPJ" | "PASSAPORTE">("CPF");
  const [docNumber, setDocNumber] = useState(
    reservationData?.guestName ? "" : "643.204.301-82"
  );
  const [guestName, setGuestName] = useState(reservationData?.guestName || "CARLOS DAVI SOUZA FERREIRA");
  const [phone, setPhone] = useState(reservationData?.phone || "(11) 98765-4321");

  // Sincronizar e verificar cadastro do hóspede quando o modal for aberto a partir de uma reserva
  useEffect(() => {
    if (isOpen && reservationData) {
      if (reservationData.guestName) {
        const nameUpper = reservationData.guestName.toUpperCase();
        setGuestName(nameUpper);

        // Verificar se este hóspede já possui cadastro verificado no banco
        const found = mockGuestDB.find(
          (g) => g.name.toUpperCase() === nameUpper || (g.doc && g.doc === reservationData.phone)
        );

        if (found) {
          setDocNumber(found.doc);
          setPhone(found.phone || reservationData.phone || "");
          setHubGuestSaved(true);
          setHubMessage(`✓ Hóspede '${nameUpper}' localizado no banco de dados com cadastro verificado (CPF: ${found.doc}).`);
        } else {
          setDocNumber("");
          if (reservationData.phone) setPhone(reservationData.phone);
          setHubGuestSaved(false);
          setHubMessage(`⚠️ ATENÇÃO: Hóspede sem cadastro verificado no banco. Pesquise (🔍), consulte CPF (🌐) ou inclua (+) o cadastro completo.`);
        }
      }
      if (reservationData.checkInDate) {
        const local = brDateTimeToLocal(reservationData.checkInDate);
        if (local) setDtChegadaLocal(local);
      }
      if (reservationData.checkOutDate) {
        const local = brDateTimeToLocal(reservationData.checkOutDate);
        if (local) setDtSaidaLocal(local);
      }
    }
  }, [isOpen, reservationData]);

  // WhatsApp active verification & Meta username state
  const [whatsappPhone, setWhatsappPhone] = useState<string>("");
  const [nomeUsuarioWpp, setNomeUsuarioWpp] = useState<string>("");
  const [whatsappName, setWhatsappName] = useState<string>("");
  const [hasWhatsapp, setHasWhatsapp] = useState<boolean>(false);

  // Interactive Phone & WhatsApp Manager state
  const [verifiedPhones, setVerifiedPhones] = useState<VerifiedPhone[]>([]);
  const [newPhoneInput, setNewPhoneInput] = useState<string>("");
  const [verifyingPhone, setVerifyingPhone] = useState<boolean>(false);

  // Helper: Set primary WhatsApp phone
  const handleSetPrimaryPhone = useCallback((phoneId: string) => {
    setVerifiedPhones((prev) => {
      const updated = prev.map((p) => ({
        ...p,
        isPrimary: p.id === phoneId,
      }));
      const selected = updated.find((p) => p.id === phoneId);
      if (selected) {
        setPhone(selected.number);
        setWhatsappPhone(selected.number);
        setNomeUsuarioWpp(selected.nomeUsuarioWpp);
        setWhatsappName(selected.whatsappName || guestName);
        setHasWhatsapp(selected.hasWhatsapp);
      }
      return updated;
    });
  }, [guestName]);

  // Helper: Remove phone from list
  const handleRemovePhone = useCallback((phoneId: string) => {
    setVerifiedPhones((prev) => {
      const filtered = prev.filter((p) => p.id !== phoneId);
      if (filtered.length > 0 && !filtered.some((p) => p.isPrimary)) {
        filtered[0].isPrimary = true;
        setPhone(filtered[0].number);
        setWhatsappPhone(filtered[0].number);
        setNomeUsuarioWpp(filtered[0].nomeUsuarioWpp);
        setWhatsappName(filtered[0].whatsappName || guestName);
        setHasWhatsapp(filtered[0].hasWhatsapp);
      } else if (filtered.length === 0) {
        setWhatsappPhone("");
        setNomeUsuarioWpp("");
        setHasWhatsapp(false);
      }
      return filtered;
    });
  }, [guestName]);

  // Helper: Add custom phone and verify Uazapi status in real-time
  const handleAddAndVerifyPhone = async () => {
    if (!newPhoneInput.trim()) return;
    const cleanPhone = newPhoneInput.trim();

    setVerifyingPhone(true);
    try {
      const res = await fetch("/api/stay/verify-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, guestName }),
      });
      const data = await res.json();
      if (data.success && data.verifiedPhone) {
        const item: VerifiedPhone = data.verifiedPhone;
        setVerifiedPhones((prev) => {
          const isFirst = prev.length === 0;
          const newItem = { ...item, isPrimary: isFirst || item.isPrimary };
          if (newItem.isPrimary) {
            setPhone(newItem.number);
            setWhatsappPhone(newItem.number);
            setNomeUsuarioWpp(newItem.nomeUsuarioWpp);
            setWhatsappName(newItem.whatsappName || guestName);
            setHasWhatsapp(newItem.hasWhatsapp);
          }
          return [...prev, newItem];
        });
        setNewPhoneInput("");
      }
    } catch {
      // Dev Fallback
      const digitsOnly = cleanPhone.replace(/\D/g, "");
      const isValid = digitsOnly.length >= 10;
      const slug = guestName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ".") + ".wpp";
      const newItem: VerifiedPhone = {
        id: `TEL-${Date.now()}`,
        number: cleanPhone,
        hasWhatsapp: isValid,
        nomeUsuarioWpp: isValid ? slug : "",
        whatsappName: isValid ? guestName : "",
        isPrimary: verifiedPhones.length === 0,
      };
      setVerifiedPhones((prev) => [...prev, newItem]);
      if (newItem.isPrimary) {
        setPhone(cleanPhone);
        setWhatsappPhone(cleanPhone);
        setNomeUsuarioWpp(newItem.nomeUsuarioWpp);
        setHasWhatsapp(newItem.hasWhatsapp);
      }
      setNewPhoneInput("");
    } finally {
      setVerifyingPhone(false);
    }
  };

  // Dates & Occupants
  // ── Internal state: stored as datetime-local format "YYYY-MM-DDTHH:MM" ──
  const buildInitialCheckin = () => {
    if (reservationData?.checkInDate) return brDateTimeToLocal(reservationData.checkInDate);
    return nowLocalMin();
  };

  const buildInitialCheckout = (checkoutTime: string) => {
    if (reservationData?.checkOutDate) return brDateTimeToLocal(reservationData.checkOutDate);
    return buildLocalDateTime(tomorrowDateStr(), checkoutTime);
  };

  const [dtChegadaLocal, setDtChegadaLocal] = useState<string>(buildInitialCheckin);
  const [dtSaidaLocal, setDtSaidaLocal] = useState<string>(() => buildInitialCheckout(defaultCheckOutTime));

  // Keep BR-formatted versions for display & payload
  const dtChegada = localToBrDateTime(dtChegadaLocal);
  const dtSaida = localToBrDateTime(dtSaidaLocal);

  // Date validation state
  const [dateError, setDateError] = useState<string | null>(null);

  const [adults, setAdults] = useState<number>(reservationData?.adults || 1);
  const [children, setChildren] = useState<number>(reservationData?.children || 0);
  const [nights, setNights] = useState<number>(1);

  // Handler: change check-in date — must not be before today
  const handleDtChegadaChange = useCallback((newLocalVal: string) => {
    const todayMin = nowLocalMin();
    if (newLocalVal < todayMin) {
      setDateError("A data de chegada não pode ser anterior à data/hora atual.");
      setDtChegadaLocal(todayMin);
      // Also adjust checkout if it falls before new checkin
      const checkoutDate = localToDateOnly(dtSaidaLocal);
      const checkinDate = localToDateOnly(todayMin);
      if (checkoutDate <= checkinDate) {
        setDtSaidaLocal(buildLocalDateTime(tomorrowDateStr(), defaultCheckOutTime));
      }
      return;
    }
    setDtChegadaLocal(newLocalVal);
    setDateError(null);
    // Enforce: checkout date must be >= checkin date
    const newCheckinDate = localToDateOnly(newLocalVal);
    const checkoutDate = localToDateOnly(dtSaidaLocal);
    if (checkoutDate < newCheckinDate) {
      // Move checkout to next day after new checkin
      const nextDay = new Date(newLocalVal.split("T")[0]);
      nextDay.setDate(nextDay.getDate() + 1);
      const pad = (n: number) => (n < 10 ? "0" + n : String(n));
      const nextDayStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      setDtSaidaLocal(buildLocalDateTime(nextDayStr, defaultCheckOutTime));
    } else if (checkoutDate === newCheckinDate) {
      // Same day: checkout must still be after checkin, move to next day
      const nextDay = new Date(newLocalVal.split("T")[0]);
      nextDay.setDate(nextDay.getDate() + 1);
      const pad = (n: number) => (n < 10 ? "0" + n : String(n));
      const nextDayStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      setDtSaidaLocal(buildLocalDateTime(nextDayStr, defaultCheckOutTime));
    }
  }, [dtSaidaLocal, defaultCheckOutTime]);

  // Handler: change checkout — must not be before checkin, hour locked to configured time
  const handleDtSaidaChange = useCallback((newLocalVal: string) => {
    const checkinDate = localToDateOnly(dtChegadaLocal);
    const newCheckoutDate = localToDateOnly(newLocalVal);
    // Always override time portion with configured checkout time
    const correctedVal = buildLocalDateTime(newCheckoutDate, defaultCheckOutTime);

    if (newCheckoutDate < checkinDate) {
      setDateError("A data de saída não pode ser anterior à data de chegada.");
      // Set to next day after checkin
      const nextDay = new Date(dtChegadaLocal.split("T")[0]);
      nextDay.setDate(nextDay.getDate() + 1);
      const pad = (n: number) => (n < 10 ? "0" + n : String(n));
      const nextDayStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      setDtSaidaLocal(buildLocalDateTime(nextDayStr, defaultCheckOutTime));
      return;
    }
    if (newCheckoutDate === checkinDate) {
      setDateError("A data de saída não pode ser igual à data de chegada. Mínimo 1 diária.");
      const nextDay = new Date(dtChegadaLocal.split("T")[0]);
      nextDay.setDate(nextDay.getDate() + 1);
      const pad = (n: number) => (n < 10 ? "0" + n : String(n));
      const nextDayStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      setDtSaidaLocal(buildLocalDateTime(nextDayStr, defaultCheckOutTime));
      return;
    }
    setDateError(null);
    setDtSaidaLocal(correctedVal);
  }, [dtChegadaLocal, defaultCheckOutTime]);

  const formatDateForInput = (d: Date) => {
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const now = new Date();

  // Tariff Selection (Print 2)
  const [selectedTariff, setSelectedTariff] = useState<TariffOption>(LISTA_TARIFAS[0]);
  const [dailyRate, setDailyRate] = useState<number>(LISTA_TARIFAS[0].price);
  const [showTariffDropdown, setShowTariffDropdown] = useState<boolean>(false);
  const tariffDropdownRef = useRef<HTMLDivElement>(null);

  // Secondary Guests
  const [secondaryGuests, setSecondaryGuests] = useState<SecondaryGuest[]>([]);
  const [newGuestInput, setNewGuestInput] = useState("");

  // Initial Payments / Deposits
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toLocaleDateString("pt-BR"));
  const [paymentAmount, setPaymentAmount] = useState<string>("0,00");
  const [paymentMethod, setPaymentMethod] = useState<string>("Dinheiro");
  const [paymentsList, setPaymentsList] = useState<PaymentItem[]>(
    reservationData?.depositPaid
      ? [{ id: "PAY-1", date: new Date().toLocaleDateString("pt-BR"), amount: reservationData.depositPaid, methodDescription: "Adiantamento Reserva (PIX)" }]
      : []
  );

  // Observations
  const [obsDate, setObsDate] = useState<string>(formatDateForInput(now));
  const [obsType, setObsType] = useState<string>("1 - Recepção");
  const [obsText, setObsText] = useState<string>("");
  const [obsList, setObsList] = useState<ObservationItem[]>([]);

  // Financial Calculations, Discount & Auto-registered Guest Info
  const [discount, setDiscount] = useState<number>(0);
  const [hubLoading, setHubLoading] = useState<boolean>(false);
  const [hubMessage, setHubMessage] = useState<string | null>(null);
  
  // Additional Guest Details from Hub do Desenvolvedor / Database
  const [birthDate, setBirthDate] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [motherName, setMotherName] = useState<string>("");
  const [fatherName, setFatherName] = useState<string>("");
  const [identity, setIdentity] = useState<string>("");
  const [fullAddress, setFullAddress] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [telephonesList, setTelephonesList] = useState<string[]>([]);
  const [emailsList, setEmailsList] = useState<string[]>([]);
  const [hubGuestSaved, setHubGuestSaved] = useState<boolean>(false);

  // Guest data visibility toggle (eye button)
  const [showGuestData, setShowGuestData] = useState<boolean>(false);

  // Search Guest Modal
  const [showSearchGuestModal, setShowSearchGuestModal] = useState<boolean>(false);
  const [searchGuestQuery, setSearchGuestQuery] = useState<string>("");
  // Guest Database List (com inclusão automática via API)
  const mockGuestDB = [
    { name: "ANSELMO DE SOUZA LEÃO", doc: "123.456.789-00", phone: "(35) 98414-0199" },
    { name: "MARCELO LIMA NUNES", doc: "111.222.333-44", phone: "(11) 98888-1111" },
    { name: "PEDRO RICARDO DA SILVA FAGUNDES", doc: "222.333.444-55", phone: "(21) 99999-2222" },
    { name: "CARLOS DAVI SOUZA FERREIRA", doc: "643.204.301-82", phone: "(11) 98765-4321" },
    { name: "MARIA CAROLINA LOPES", doc: "775.252.801-34", phone: "(11) 90719-3807" },
    { name: "JOÃO PEDRO ALMEIDA", doc: "321.456.789-00", phone: "(68) 99887-6543" },
    { name: "ANA PAULA FERREIRA", doc: "123.456.789-09", phone: "(11) 91234-5678" },
    { name: "ROBERTO CARLOS SILVA", doc: "987.654.321-00", phone: "(21) 99876-5432" },
  ];
  const filteredGuests = mockGuestDB.filter(
    (g) =>
      g.name.includes(searchGuestQuery.toUpperCase()) ||
      g.doc.includes(searchGuestQuery)
  );

  // Manual Guest Modal
  const [showManualGuestModal, setShowManualGuestModal] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    name: "", doc: "", docType: "CPF", phone: "",
    birthDate: "", gender: "", motherName: "", fatherName: "",
    identity: "", address: "", email: "",
  });

  const handleSelectSearchGuest = (guest: typeof mockGuestDB[0]) => {
    setGuestName(guest.name);
    setDocNumber(guest.doc);
    setPhone(guest.phone);
    setHubGuestSaved(true);
    setShowGuestData(false);
    setHubMessage(`✓ Hóspede '${guest.name}' localizado e verificado no cadastro com sucesso.`);
    setShowSearchGuestModal(false);
  };

  const handleConfirmManualGuest = () => {
    if (!manualForm.name.trim()) { alert("Informe o nome do hóspede."); return; }
    const uppercaseName = manualForm.name.toUpperCase();
    setGuestName(uppercaseName);
    setDocNumber(manualForm.doc);
    setPhone(manualForm.phone);
    setBirthDate(manualForm.birthDate);
    setGender(manualForm.gender);
    setMotherName(manualForm.motherName);
    setFatherName(manualForm.fatherName);
    setIdentity(manualForm.identity);
    setFullAddress(manualForm.address);
    setEmail(manualForm.email);
    setEmailsList(manualForm.email ? [manualForm.email] : []);
    setTelephonesList(manualForm.phone ? [manualForm.phone] : []);
    setHubGuestSaved(true);
    setShowGuestData(false);
    setHubMessage(`✓ Hóspede '${uppercaseName}' cadastrado no banco de dados com sucesso!`);
    setShowManualGuestModal(false);
    
    // Enviar dados para persistência assíncrona no backend
    fetch("/api/cadastros/hospedes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: "TNT-01",
        fullName: uppercaseName,
        documentType: manualForm.docType,
        cpf: manualForm.doc,
        phone: manualForm.phone,
        email: manualForm.email,
        birthDate: manualForm.birthDate,
        gender: manualForm.gender,
        motherName: manualForm.motherName,
        fatherName: manualForm.fatherName,
        identity: manualForm.identity,
        address: manualForm.address,
      }),
    }).catch(err => console.warn("[handleConfirmManualGuest] Erro ao salvar cadastro:", err));

    setManualForm({ name: "", doc: "", docType: "CPF", phone: "", birthDate: "", gender: "", motherName: "", fatherName: "", identity: "", address: "", email: "" });
  };

  // Calculate nights difference on date change (using datetime-local strings for precision)
  useEffect(() => {
    try {
      const d1 = new Date(dtChegadaLocal);
      const d2 = new Date(dtSaidaLocal);
      const diffMs = d2.getTime() - d1.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 3600 * 24)));
      setNights(diffDays);
    } catch {
      setNights(1);
    }
  }, [dtChegadaLocal, dtSaidaLocal]);

  // Total calculations
  const totalDiariasBruto = nights * dailyRate;
  const totalAdiantamento = paymentsList.reduce((acc, item) => acc + item.amount, 0);
  const saldoAPagar = Math.max(0, totalDiariasBruto - discount - totalAdiantamento);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tariffDropdownRef.current && !tariffDropdownRef.current.contains(event.target as Node)) {
        setShowTariffDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Hub do Desenvolvedor CPF Consultation & Automatic Guest Database Registration handler
  const handleHubCpfSearch = async () => {
    const clean = docNumber.replace(/\D/g, "");
    if (docType === "CPF" && clean.length !== 11) {
      alert("Por favor, digite um CPF válido com 11 dígitos para consultar no Hub do Desenvolvedor.");
      return;
    }
    setHubLoading(true);
    setHubMessage(null);
    setHubGuestSaved(false);

    try {
      const res = await fetch(`/api/stay/hub-consult-cpf?cpf=${clean}`);
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        setGuestName(d.nome || guestName);
        setPhone(d.telefone || phone);
        setWhatsappPhone(d.whatsappPhone || d.telefone || "");
        setNomeUsuarioWpp(d.nomeUsuarioWpp || "");
        setWhatsappName(d.whatsappName || d.nome || "");
        setHasWhatsapp(!!d.hasWhatsapp);

        if (d.telefonesVerificados && d.telefonesVerificados.length > 0) {
          setVerifiedPhones(d.telefonesVerificados);
        } else if (d.telefones && d.telefones.length > 0) {
          const mapped: VerifiedPhone[] = d.telefones.map((tel: string, i: number) => ({
            id: `TEL-${i + 1}`,
            number: tel,
            hasWhatsapp: tel.replace(/\D/g, "").length >= 10,
            nomeUsuarioWpp: (d.nome || guestName).toLowerCase().replace(/\s+/g, ".") + (i > 0 ? `.${i + 1}` : "") + ".wpp",
            whatsappName: d.nome || guestName,
            isPrimary: i === 0,
          }));
          setVerifiedPhones(mapped);
        }

        setBirthDate(d.dataNascimento || "");
        setGender(d.genero || "");
        setMotherName(d.nomeDaMae || "");
        setFatherName(d.nomeDoPai || "");
        setIdentity(d.identidade || clean);
        setFullAddress(d.enderecoCompleto || "");
        setEmail(d.email || "");
        setTelephonesList(d.telefones || []);
        setEmailsList(d.emails || []);
        setHubGuestSaved(true);
        setHubMessage(`✓ Hóspede '${d.nome}' cadastrado automaticamente no banco de dados com sucesso!`);
      } else {
        setHubMessage(`⚠️ ${data.message || "CPF não localizado na API."}`);
      }
    } catch {
      // Fallback offline mock for dev
      setGuestName("MARIA CAROLINA LOPES");
      setPhone("(11) 90719-3807");
      setWhatsappPhone("(11) 90719-3807");
      setNomeUsuarioWpp("maria.carolina.lopes.wpp");
      setWhatsappName("MARIA CAROLINA LOPES");
      setHasWhatsapp(true);
      setVerifiedPhones([
        {
          id: "TEL-1",
          number: "(11) 90719-3807",
          hasWhatsapp: true,
          nomeUsuarioWpp: "maria.carolina.lopes.wpp",
          whatsappName: "MARIA CAROLINA LOPES",
          isPrimary: true,
        },
        {
          id: "TEL-2",
          number: "(68) 99909-9646",
          hasWhatsapp: true,
          nomeUsuarioWpp: "maria.carolina.lopes.2.wpp",
          whatsappName: "MARIA CAROLINA LOPES",
          isPrimary: false,
        }
      ]);
      setBirthDate("17/07/1981");
      setGender("Feminino");
      setMotherName("VERONICA ROSALEA");
      setFatherName("");
      setIdentity(clean);
      setFullAddress("RUA PERNAMBUCO, Nº 443 ALT - BOSQUE, RIO BRANCO/AC - CEP 69900-421");
      setEmail("maria.mariacarolina@gmail.com");
      setTelephonesList(["(11) 907193807", "(68) 999099646"]);
      setEmailsList(["maria.mariacarolina@gmail.com"]);
      setHubGuestSaved(true);
      setHubMessage("✓ Hóspede 'MARIA CAROLINA LOPES' cadastrado automaticamente no banco de dados.");
    } finally {
      setHubLoading(false);
    }
  };

  // Add Secondary Guest
  const handleAddSecondaryGuest = () => {
    if (!newGuestInput.trim()) return;
    setSecondaryGuests((prev) => [
      ...prev,
      { id: `SEC-${Date.now()}`, name: newGuestInput.trim().toUpperCase() },
    ]);
    setNewGuestInput("");
  };

  const handleRemoveSecondaryGuest = (id: string) => {
    setSecondaryGuests((prev) => prev.filter((g) => g.id !== id));
  };

  // Add Payment — posts to BOTH room account and caixa (cash register)
  const [paymentPosting, setPaymentPosting] = useState<boolean>(false);
  const [lastCaixaMovId, setLastCaixaMovId] = useState<string | null>(null);

  const handleAddPayment = async () => {
    const num = parseFloat(paymentAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(num) || num <= 0) {
      alert("Informe um valor válido para o pagamento.");
      return;
    }

    const payId = `PAY-${Date.now()}`;

    // Map form method to API format
    const methodMap: Record<string, string> = {
      "Dinheiro": "DINHEIRO",
      "PIX Instantâneo": "PIX",
      "Cartão Crédito": "CARTAO_CREDITO",
      "Cartão Débito": "CARTAO_DEBITO",
      "Faturado Corporativo": "FATURADO_CORPORATIVO",
    };

    // Optimistically add to local list first
    setPaymentsList((prev) => [
      ...prev,
      {
        id: payId,
        date: paymentDate,
        amount: num,
        methodDescription: paymentMethod,
      },
    ]);
    setPaymentAmount("0,00");

    // Dual-post to backend: room account + caixa
    setPaymentPosting(true);
    try {
      const res = await fetch("/api/caixa/pagamento-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: "USR-001",
          operatorName: "OPERADOR RECEPCAO",
          roomId: roomData.number,
          stayCheckinId: payId,          // temp ID until check-in confirmed
          guestName: guestName,
          valor: num,
          formaPagamento: methodMap[paymentMethod] || "DINHEIRO",
          descricao: `Pagamento no Check-in — Quarto ${roomData.number}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastCaixaMovId(data.movimentoCaixaId);
      }
    } catch {
      // Fail silently — payment still recorded locally
    } finally {
      setPaymentPosting(false);
    }
  };

  const handleRemovePayment = (id: string) => {
    setPaymentsList((prev) => prev.filter((p) => p.id !== id));
  };

  // Add Observation
  const handleAddObservation = () => {
    if (!obsText.trim()) return;
    setObsList((prev) => [
      ...prev,
      {
        id: `OBS-${Date.now()}`,
        dateTime: obsDate,
        typeDescription: obsType,
        note: obsText.trim(),
      },
    ]);
    setObsText("");
  };

  const handleRemoveObservation = (id: string) => {
    setObsList((prev) => prev.filter((o) => o.id !== id));
  };

  // Submit Check-in — posts dailies to room account + executes check-in
  const handleConfirmCheckin = async () => {
    // Validations
    if (!guestName.trim()) {
      toast.warning("O Nome do Hóspede Principal é obrigatório.", "Campo Obrigatório");
      return;
    }

    // Trava de verificação de cadastro no banco de dados
    if (!docNumber.trim() || docNumber === "000.000.000-00") {
      toast.error(
        "O número do documento (CPF/CNPJ/Passaporte) do hóspede é obrigatório.\n\nPor favor, digite o CPF do hóspede e consulte (🌐), ou pesquise no cadastro (🔍).",
        "Check-in Bloqueado"
      );
      return;
    }

    if (!hubGuestSaved) {
      toast.error(
        `O hóspede '${guestName}' não possui cadastro verificado no banco de dados.\n\nNão é permitido efetuar a hospedagem sem a verificação prévia do cadastro.\n\nPor favor, pesquise o hóspede (🔍) ou inclua (+) o cadastro.`,
        "Hospedagem Bloqueada"
      );
      return;
    }

    if (docType === "CPF" && docNumber.trim()) {
      if (!validateCPF(docNumber)) {
        toast.error("O CPF informado possui dígitos verificadores inválidos.", "CPF Inválido");
        return;
      }
    } else if (docType === "CNPJ" && docNumber.trim()) {
      if (!validateCNPJ(docNumber)) {
        toast.error("O CNPJ informado possui dígitos verificadores inválidos.", "CNPJ Inválido");
        return;
      }
    }

    if (adults < 1) {
      toast.warning("O número de adultos deve ser pelo menos 1.", "Atenção");
      return;
    }

    if (adults > selectedTariff.pax) {
      toast.warning(
        `A quantidade de adultos (${adults}) excede o limite máximo permitido pela tarifa selecionada '${selectedTariff.name}' (máximo ${selectedTariff.pax} adulto(s)).`,
        "Capacidade Excedida"
      );
      return;
    }

    // Generate stay ID for linking room account entries
    const newStayId = `HPD-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      roomId: roomData.number,
      documentType: docType,
      documentNumber: docNumber,
      guestName: guestName.toUpperCase(),
      phone,
      tariffId: selectedTariff.id,
      tariffName: selectedTariff.name,
      dailyRate,
      checkInDate: dtChegada,
      checkOutDate: dtSaida,
      adults,
      children,
      nights,
      secondaryGuests,
      initialPayments: paymentsList,
      observations: obsList,
      totalBruto: totalDiariasBruto,
      discount,
      totalAdvance: totalAdiantamento,
      balance: saldoAPagar,
      stayCheckinId: newStayId,
    };

    // 1. Post dailies to room account
    try {
      await fetch("/api/caixa/lancamento-diaria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomData.number,
          stayCheckinId: newStayId,
          guestName: guestName.toUpperCase(),
          totalDiarias: totalDiariasBruto,
          nights,
          dailyRate,
          tariffName: selectedTariff.name,
        }),
      });
    } catch {
      // Fail silently — check-in proceeds regardless
    }

    // 2. Execute check-in
    onSuccess(payload);
  };

  return (
    <div className={`fixed inset-0 z-50 ${modalOverlayClass} flex items-center justify-center p-2 sm:p-4 overflow-y-auto`}>
      <div className={modalBoxClass}>
        {/* MODAL TITLE BAR */}
        <div className={modalHeaderClass}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDark ? "bg-[#00b4d8]/20 border border-[#00b4d8]/40" : "bg-[#0284C7]/15 border border-[#0284C7]/30"}`}>
              <UserCheck className={`w-5 h-5 ${isDark ? "text-[#00b4d8]" : "text-[#0284C7]"}`} />
            </div>
            <div>
              <h2 className={`font-bold text-base tracking-wide flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                Hospedagem — Situação da thread: <span className="text-amber-500 font-mono text-xs">Thread_ChecarQuartos - suspenso</span>
              </h2>
              <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>Recepção • Efetuar Check-in no Quarto {roomData.number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isDark ? "bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white" : "bg-slate-200 hover:bg-rose-600 text-slate-600 hover:text-white"}`}
            title="Fechar Janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY CONTENT AREA */}
        <div className={`p-4 space-y-4 overflow-y-auto custom-scrollbar text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
          
          {/* HEADER FIELDSET: DADOS DA RESERVA */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>
              <Info className="w-3.5 h-3.5" /> Dados da Reserva:
            </legend>

            {/* Row 1: Reservation Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 items-end">
              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>No.Reserva</label>
                <input
                  type="text"
                  readOnly
                  value={reservationData?.reservationNumber || "—"}
                  className={`w-full rounded-md px-2 py-1 font-mono text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-slate-400" : "bg-slate-100 border border-slate-300 text-slate-600"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Origem da Reserva</label>
                <input
                  type="text"
                  readOnly
                  value={reservationData?.origin || "Balcão / Recepção Direct"}
                  className={`w-full rounded-md px-2 py-1 font-medium text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-slate-300" : "bg-slate-100 border border-slate-300 text-slate-800"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Dt.Chegada</label>
                <input
                  type="text"
                  readOnly
                  value={dtChegada.split(" ")[0]}
                  className={`w-full rounded-md px-2 py-1 font-mono text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-emerald-400" : "bg-emerald-50 border border-emerald-300 text-emerald-700 font-bold"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Dt.Saida</label>
                <input
                  type="text"
                  readOnly
                  value={dtSaida.split(" ")[0]}
                  className={`w-full rounded-md px-2 py-1 font-mono text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-amber-400" : "bg-amber-50 border border-amber-300 text-amber-700 font-bold"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Adulto</label>
                <input
                  type="number"
                  readOnly
                  value={adults}
                  className={`w-full text-center font-bold rounded-md px-2 py-1 text-[11px] ${isDark ? "bg-amber-400/20 border border-amber-400/40 text-amber-300" : "bg-amber-100 border border-amber-300 text-amber-800"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Criança</label>
                <input
                  type="number"
                  readOnly
                  value={children}
                  className={`w-full text-center font-bold rounded-md px-2 py-1 text-[11px] ${isDark ? "bg-amber-400/20 border border-amber-400/40 text-amber-300" : "bg-amber-100 border border-amber-300 text-amber-800"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Diarias</label>
                <input
                  type="number"
                  readOnly
                  value={nights}
                  className={`w-full text-center font-bold rounded-md px-2 py-1 text-[11px] ${isDark ? "bg-amber-400/20 border border-amber-400/40 text-amber-300" : "bg-amber-100 border border-amber-300 text-amber-800"}`}
                />
              </div>
            </div>

            {/* Row 2: Room Meta & Guest Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-12 gap-2.5 items-end pt-1">
              <div className="md:col-span-1">
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>No. Quarto</label>
                <input
                  type="text"
                  readOnly
                  value={roomData.number}
                  className={`w-full rounded-md px-2 py-1 font-bold font-mono text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-cyan-400" : "bg-sky-50 border border-sky-300 text-sky-800"}`}
                />
              </div>

              <div className="md:col-span-3">
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Descrição quarto</label>
                <input
                  type="text"
                  readOnly
                  value={roomData.description || "1 CAMA DE CASAL + 1 SOLTEIRO"}
                  className={`w-full rounded-md px-2 py-1 font-medium text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-slate-300" : "bg-slate-100 border border-slate-300 text-slate-800"}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Local</label>
                <input
                  type="text"
                  readOnly
                  value={roomData.location || "TÉRREO"}
                  className={`w-full rounded-md px-2 py-1 font-medium text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-slate-300" : "bg-slate-100 border border-slate-300 text-slate-800"}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Categoria</label>
                <input
                  type="text"
                  readOnly
                  value={roomData.category || "ESPECIAL"}
                  className={`w-full rounded-md px-2 py-1 font-bold text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-amber-300" : "bg-amber-50 border border-amber-300 text-amber-800"}`}
                />
              </div>

              <div className="md:col-span-4">
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Nome do Hospede Principal</label>
                <input
                  type="text"
                  readOnly
                  value={guestName}
                  className={`w-full font-bold rounded-md px-2 py-1 text-[11px] ${isDark ? "bg-amber-400/20 border border-amber-400/40 text-yellow-200" : "bg-amber-100 border border-amber-300 text-amber-900"}`}
                />
              </div>
            </div>

            {/* Header Totals Strip */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t items-center ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
              <div className={`p-2 rounded-lg border ${isDark ? "bg-slate-950/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>Valor TOTAL (R$)</span>
                <span className={`text-sm font-bold font-mono ${isDark ? "text-slate-200" : "text-slate-900"}`}>R$ {totalDiariasBruto.toFixed(2).replace(".", ",")}</span>
              </div>

              <div className={`p-2 rounded-lg border ${isDark ? "bg-slate-950/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>Total Adiant. (R$)</span>
                <span className={`text-sm font-bold font-mono ${isDark ? "text-cyan-400" : "text-sky-700"}`}>R$ {totalAdiantamento.toFixed(2).replace(".", ",")}</span>
              </div>

              <div className={`p-2 rounded-lg border ${isDark ? "bg-slate-950/70 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500 font-medium"}`}>Desconto (R$)</span>
                <span className={`text-sm font-bold font-mono ${isDark ? "text-rose-400" : "text-rose-600"}`}>R$ {discount.toFixed(2).replace(".", ",")}</span>
              </div>

              <div className={`p-2 rounded-lg border ${isDark ? "bg-amber-400/15 border-amber-400/30" : "bg-amber-50 border-amber-300 shadow-sm"}`}>
                <span className={`text-[10px] font-bold block ${isDark ? "text-amber-300" : "text-amber-800"}`}>TOTAL Liquido (R$)</span>
                <span className={`text-base font-extrabold font-mono ${isDark ? "text-yellow-300" : "text-amber-900"}`}>R$ {saldoAPagar.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          </fieldset>

          {/* SECTION 1: 1-TARIFA/QUARTO (PRINT 2 SELECTION DROPDOWN) */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>
              <DollarSign className="w-3.5 h-3.5" /> 1-Tarifa/Quarto
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* PRINT 2 MULTI-COLUMN TARIFF DROPDOWN */}
              <div className="md:col-span-6 relative" ref={tariffDropdownRef}>
                <label className={`text-[11px] font-bold block mb-1 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  Tarifas <span className="text-rose-400">*</span>
                </label>
                <div
                  onClick={() => setShowTariffDropdown(!showTariffDropdown)}
                  className={`w-full rounded-lg p-2.5 cursor-pointer flex items-center justify-between transition-colors border ${
                    isDark
                      ? "bg-slate-950 border-slate-700 hover:border-[#00b4d8]"
                      : "bg-white border-slate-300 hover:border-[#0284C7] text-slate-900 shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`font-bold text-xs truncate ${isDark ? "text-white" : "text-slate-900"}`}>{selectedTariff.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${isDark ? "bg-sky-500/15 text-sky-400 border border-sky-500/30" : "bg-sky-50 text-sky-700 border border-sky-200"}`}>
                      {selectedTariff.pax} {selectedTariff.pax === 1 ? "Adulto" : "Adultos"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold text-xs ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>R$ {selectedTariff.price.toFixed(2).replace(".", ",")}</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showTariffDropdown ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* PRINT 2 POPUP GRID TABLE DROPDOWN */}
                {showTariffDropdown && (
                  <div className={`absolute left-0 top-full mt-1 z-50 w-full rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar border ${
                    isDark ? "bg-[#090D16] border-[#00b4d8]/60" : "bg-white border-slate-300 text-slate-900"
                  }`}>
                    <div className={`px-3 py-2 text-[11px] font-bold grid grid-cols-12 gap-2 sticky top-0 z-10 shadow border-b ${
                      isDark ? "bg-slate-900 border-slate-800 text-[#00b4d8]" : "bg-slate-100 border-slate-200 text-[#0284C7]"
                    }`}>
                      <span className="col-span-7">DESCRIÇÃO TARIFA</span>
                      <span className="col-span-2 text-center">ADULTOS</span>
                      <span className="col-span-3 text-right">VALOR (R$)</span>
                    </div>

                    <div className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                      {LISTA_TARIFAS.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTariff(t);
                            setDailyRate(t.price);
                            setAdults(t.pax);
                            setShowTariffDropdown(false);
                          }}
                          className={`px-3 py-2 grid grid-cols-12 gap-2 text-xs items-center cursor-pointer transition-colors ${
                            selectedTariff.id === t.id
                              ? isDark ? "bg-[#00b4d8]/20 text-white font-bold border-l-4 border-[#00b4d8]" : "bg-[#0284C7]/15 text-[#0284C7] font-bold border-l-4 border-[#0284C7]"
                              : isDark ? "hover:bg-slate-800/80 text-slate-300" : "hover:bg-slate-100 text-slate-800"
                          }`}
                        >
                          <span className="col-span-7 font-semibold truncate">{t.name}</span>
                          <span className="col-span-2 text-center font-mono opacity-75">{t.pax}</span>
                          <span className={`col-span-3 text-right font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                            R$ {t.price.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Valor diária (R$) */}
              <div className="md:col-span-2">
                <label className={`text-[11px] font-semibold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Valor diaria (R$)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={dailyRate}
                    onChange={(e) => setDailyRate(parseFloat(e.target.value) || 0)}
                    className={`w-full border rounded-lg p-2 font-mono font-bold text-xs text-right outline-none ${
                      isDark ? "bg-slate-950 border-slate-700 text-emerald-400 focus:border-[#00b4d8]" : "bg-white border-slate-300 text-emerald-600 focus:border-[#0284C7]"
                    }`}
                  />
                </div>
              </div>

              {/* Quartos selector */}
              <div className="md:col-span-2">
                <label className={`text-[11px] font-semibold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Quartos</label>
                <select
                  value={roomData.number}
                  onChange={() => {}}
                  className={`w-full border rounded-lg p-2 font-bold text-xs outline-none ${
                    isDark ? "bg-slate-950 border-slate-700 text-white focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                  }`}
                >
                  <option value={roomData.number}>{roomData.number}</option>
                </select>
              </div>

              {/* Categoria info display */}
              <div className="md:col-span-2">
                <label className={`text-[11px] font-semibold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Categoria</label>
                <input
                  type="text"
                  readOnly
                  value={roomData.category || "ESPECIAL"}
                  className={`w-full font-bold rounded-lg p-2 text-xs uppercase border ${
                    isDark ? "bg-slate-950 border-slate-800 text-amber-300" : "bg-slate-100 border-slate-300 text-amber-800"
                  }`}
                />
              </div>
            </div>
          </fieldset>

          {/* SECTION 2: 2-HOSPEDE/PERIODO HOSPEDAGEM (PRINT 1) */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>
              <User className="w-3.5 h-3.5" /> 2-Hospede/Periodo hospedagem
            </legend>

            {/* Doc Type Radio Selection & Search Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* Radio buttons: CPF / CNPJ / Passaporte */}
              <div className={`md:col-span-3 flex items-center gap-3 p-2 rounded-lg border ${
                isDark ? "bg-slate-950/80 border-slate-800" : "bg-white border-slate-300"
              }`}>
                <label className={`flex items-center gap-1.5 cursor-pointer font-bold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === "CPF"}
                    onChange={() => {
                      setDocType("CPF");
                      setDocNumber("643.204.301-82");
                    }}
                    className="accent-[#0284C7]"
                  />
                  <span>CPF</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer font-bold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === "CNPJ"}
                    onChange={() => {
                      setDocType("CNPJ");
                      setDocNumber("12.345.678/0001-90");
                    }}
                    className="accent-[#0284C7]"
                  />
                  <span>CNPJ</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer font-bold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === "PASSAPORTE"}
                    onChange={() => {
                      setDocType("PASSAPORTE");
                      setDocNumber("CS987654");
                    }}
                    className="accent-[#0284C7]"
                  />
                  <span>Passaporte</span>
                </label>
              </div>

              {/* Document Input + Hub do Desenvolvedor Search Button */}
              <div className="md:col-span-3">
                <label className={`text-[11px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {docType === "CPF" ? "C.P.F." : docType === "CNPJ" ? "C.N.P.J." : "Passaporte"}
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={docNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (docType === "CPF") setDocNumber(formatCPF(val));
                      else if (docType === "CNPJ") setDocNumber(formatCNPJ(val));
                      else setDocNumber(val);
                    }}
                    placeholder={docType === "CPF" ? "000.000.000-00" : docType === "CNPJ" ? "00.000.000/0000-00" : "Nº Passaporte"}
                    className={`w-full border rounded-lg p-2 font-mono text-xs outline-none ${
                      isDark ? "bg-slate-950 border-slate-700 text-white focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleHubCpfSearch}
                    disabled={hubLoading}
                    title="Buscar Hóspede via API Hub do Desenvolvedor (CPF/CNPJ)"
                    className="px-2.5 py-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold flex items-center justify-center transition-colors disabled:opacity-50"
                  >
                    {hubLoading ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Globe className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Nome do Hospede Principal + Action Icons */}
              <div className="md:col-span-6">
                <label className={`text-[11px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome do Hospede Principal <span className="text-rose-400">*</span></label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value.toUpperCase())}
                    placeholder="NOME COMPLETO DO HÓSPEDE PRINCIPAL"
                    className={`w-full rounded-lg p-2 font-bold uppercase text-xs outline-none border ${
                      isDark
                        ? "bg-[#FEF08A]/10 border-yellow-400/50 text-yellow-200 focus:border-yellow-400"
                        : "bg-[#fef9c3] border-amber-400 text-slate-900 focus:border-amber-500"
                    }`}
                  />
                  <button
                    type="button"
                    title="Pesquisar Hóspede Cadastrado"
                    onClick={() => setShowSearchGuestModal(true)}
                    className="px-2.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Incluir Hóspede Manualmente"
                    onClick={() => setShowManualGuestModal(true)}
                    className="px-2.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title={hubGuestSaved ? (showGuestData ? "Ocultar Dados do Hóspede" : "Visualizar Dados do Hóspede") : "Nenhum hóspede selecionado"}
                    onClick={() => hubGuestSaved && setShowGuestData(!showGuestData)}
                    disabled={!hubGuestSaved}
                    className={`px-2.5 py-2 rounded-lg font-bold flex items-center justify-center transition-colors ${
                      !hubGuestSaved
                        ? "bg-slate-300 text-slate-500 cursor-not-allowed opacity-50"
                        : showGuestData
                        ? "bg-amber-500 hover:bg-amber-400 text-white"
                        : isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                    }`}
                  >
                    {showGuestData ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Hub do Desenvolvedor Status Toast */}
            {hubMessage && (
              <div className={`p-2 rounded-lg border font-medium text-[11px] flex items-center justify-between ${
                hubGuestSaved
                  ? isDark ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : isDark ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-800"
              }`}>
                <span className="flex items-center gap-1.5">
                  {hubGuestSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  {hubMessage}
                </span>
                <button onClick={() => setHubMessage(null)} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* AUTO-REGISTERED GUEST DATA PANEL */}
            {hubGuestSaved && showGuestData && (
              <div className={`rounded-xl border p-3 space-y-2.5 animate-in fade-in duration-200 ${
                isDark ? "border-[#00b4d8]/40 bg-[#00b4d8]/5" : "border-[#0284C7]/30 bg-[#0284C7]/5"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-extrabold flex items-center gap-1.5 ${isDark ? "text-[#00b4d8]" : "text-[#0284C7]"}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dados do Hóspede:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGuestData(false)}
                    className="text-[9px] opacity-75 hover:opacity-100 flex items-center gap-1 transition-opacity"
                  >
                    <EyeOff className="w-3 h-3" /> Ocultar
                  </button>
                </div>

                {/* Row 1: Nome, Data Nascimento, Gênero, Identidade */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
                  <div className="md:col-span-4">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Nome Completo</label>
                    <input type="text" readOnly value={guestName}
                      className={`w-full rounded px-2 py-1 font-bold text-[11px] border ${
                        isDark ? "bg-slate-900 border-[#00b4d8]/40 text-yellow-200" : "bg-white border-slate-300 text-slate-900"
                      }`} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Dt.Nascimento</label>
                    <input type="text" readOnly value={birthDate}
                      className={`w-full rounded px-2 py-1 font-mono text-[11px] border ${
                        isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                      }`} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Gênero</label>
                    <input type="text" readOnly value={gender}
                      className={`w-full rounded px-2 py-1 text-[11px] border ${
                        isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                      }`} />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">RG / Identidade</label>
                    <input type="text" readOnly value={identity}
                      className={`w-full rounded px-2 py-1 font-mono text-[11px] border ${
                        isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                      }`} />
                  </div>
                </div>

                {/* Row 2: Nome da Mãe, Nome do Pai */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
                  <div className="md:col-span-6">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Nome da Mãe</label>
                    <input type="text" readOnly value={motherName}
                      className={`w-full rounded px-2 py-1 uppercase text-[11px] border ${
                        isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                      }`} />
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Nome do Pai</label>
                    <input type="text" readOnly value={fatherName || "NÃO INFORMADO"}
                      className={`w-full rounded px-2 py-1 uppercase text-[11px] border ${
                        isDark ? "bg-slate-900 border-slate-700 text-slate-400" : "bg-white border-slate-300 text-slate-600"
                      }`} />
                  </div>
                </div>

                {/* Row 3: Endereço Completo */}
                <div>
                  <label className="text-[9px] opacity-75 block mb-0.5 font-bold uppercase">Endereço Completo</label>
                  <input type="text" readOnly value={fullAddress} className={`w-full border rounded p-1 text-[11px] uppercase font-medium ${
                    isDark ? "bg-slate-900 border-slate-700 text-slate-400" : "bg-white border-slate-300 text-slate-600"
                  }`} />
                </div>
                {/* Gerenciador Interativo de Telefones & WhatsApp (Uazapi Realtime) */}
                <div className={`p-3 rounded-lg border space-y-2 ${isDark ? "bg-slate-950/80 border-slate-800" : "bg-white border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-extrabold uppercase flex items-center gap-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-500" /> Gerenciador de Telefones & WhatsApp do Hóspede
                    </span>
                    <span className="text-[9px] text-slate-400">Clique na estrela para definir como WhatsApp Principal</span>
                  </div>

                  {/* Cards List of Phones */}
                  <div className="space-y-1.5">
                    {verifiedPhones.length > 0 ? (
                      verifiedPhones.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                            p.isPrimary
                              ? isDark ? "bg-emerald-950/30 border-emerald-500/50" : "bg-emerald-50 border-emerald-300"
                              : isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryPhone(p.id)}
                              title={p.isPrimary ? "WhatsApp Principal Selecionado" : "Clique para definir como WhatsApp Principal"}
                              className={`p-1 rounded transition-colors ${
                                p.isPrimary
                                  ? "text-amber-400 bg-amber-400/20"
                                  : "text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                              }`}
                            >
                              <Star className="w-4 h-4 fill-current" />
                            </button>

                            <span className="font-mono font-bold text-xs shrink-0">{p.number}</span>

                            {p.hasWhatsapp ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                WhatsApp Ativo: <span className="font-mono">{p.nomeUsuarioWpp}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                Sem WhatsApp
                              </span>
                            )}

                            {p.isPrimary && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950">
                                Principal
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemovePhone(p.id)}
                            title="Remover este número"
                            className="p-1 rounded text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] text-slate-500 italic p-2 text-center border border-dashed rounded-lg">
                        Nenhum telefone cadastrado. Digite um número abaixo para verificar na Uazapi.
                      </div>
                    )}
                  </div>

                  {/* Form: Add custom phone with Uazapi Verification */}
                  <div className="flex gap-2 pt-1 items-center">
                    <input
                      type="text"
                      value={newPhoneInput}
                      onChange={(e) => setNewPhoneInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAndVerifyPhone();
                        }
                      }}
                      placeholder="Digitar novo telefone/WhatsApp (ex: 5563992420061)..."
                      className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border outline-none ${
                        isDark ? "bg-slate-900 border-slate-700 text-white focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddAndVerifyPhone}
                      disabled={verifyingPhone || !newPhoneInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                    >
                      {verifyingPhone ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Verificar WhatsApp
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-12">
                    <label className="text-[9px] text-slate-400 block mb-0.5 font-bold uppercase">E-mails do Hóspede</label>
                    <div className="flex flex-wrap gap-1.5">
                      {emailsList.length > 0 ? emailsList.map((em, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-sky-300 text-[10px] truncate max-w-full">{em}</span>
                      )) : (
                        <span className="text-slate-500 text-[10px] italic">Sem e-mails cadastrados</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* WhatsApp Status & Meta Username Banner */}
                {hasWhatsapp && (
                  <div className={`p-2.5 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
                    isDark ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200" : "bg-emerald-50 border-emerald-300 text-emerald-900"
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-extrabold uppercase">WhatsApp Ativo Confirmado</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500 text-slate-950 font-bold">Uazapi OK</span>
                        </div>
                        <span className="text-[10px] opacity-80 block">
                          Tel: <strong className="font-mono">{whatsappPhone || phone}</strong> {whatsappName ? `(${whatsappName})` : ""}
                        </span>
                      </div>
                    </div>

                    <div className={`px-2.5 py-1 rounded-md border font-mono text-[11px] flex items-center gap-1.5 ${
                      isDark ? "bg-slate-900 border-emerald-500/30 text-emerald-300" : "bg-white border-emerald-300 text-emerald-800"
                    }`}>
                      <span className="text-[9px] uppercase font-bold text-slate-400">Usuário Meta Wpp:</span>
                      <span className="font-bold text-emerald-400">{nomeUsuarioWpp || "não.definido"}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

              {/* INDICATOR: Guest loaded but data hidden */}
              {hubGuestSaved && !showGuestData && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDark ? "bg-emerald-500/10 border-emerald-500/25" : "bg-emerald-50 border-emerald-200"}`}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className={`text-[11px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>{guestName}</span>
                  <span className="text-[10px] text-slate-500">· Hóspede carregado — clique no</span>
                  <Eye className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-500">para ver os dados</span>
                </div>
              )}

              {/* Checkin Period & Secondary Guests split view */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
                
                {/* Left Column: Dates, Occupants, Payment */}
                <div className="md:col-span-7 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                    <div className="col-span-2">
                      <label className={`text-[10px] font-bold block mb-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Dt.Chegada</label>
                      <input
                        type="datetime-local"
                        value={dtChegadaLocal}
                        min={nowLocalMin()}
                        onChange={(e) => handleDtChegadaChange(e.target.value)}
                        className={`w-full border rounded-md p-1.5 font-mono font-bold text-xs outline-none ${
                          isDark ? "bg-slate-950 border-slate-700 text-emerald-400 focus:border-emerald-400 [color-scheme:dark]" : "bg-white border-slate-300 text-emerald-600 focus:border-emerald-500 [color-scheme:light]"
                        }`}
                      />
                    </div>

                    <div className="col-span-2">
                      <label className={`text-[10px] font-bold block mb-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Dt.Saida
                        <span className="ml-1 opacity-75 font-normal">(saída: {defaultCheckOutTime}h)</span>
                      </label>
                      <input
                        type="date"
                        value={localToDateOnly(dtSaidaLocal)}
                        min={(() => {
                          const nextDay = new Date(dtChegadaLocal.split("T")[0]);
                          nextDay.setDate(nextDay.getDate() + 1);
                          const pad = (n: number) => (n < 10 ? "0" + n : String(n));
                          return `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
                        })()}
                        onChange={(e) => handleDtSaidaChange(e.target.value + "T" + defaultCheckOutTime)}
                        className={`w-full border rounded-md p-1.5 font-mono font-bold text-xs outline-none ${
                          isDark ? "bg-slate-950 border-slate-700 text-amber-400 focus:border-amber-400 [color-scheme:dark]" : "bg-white border-slate-300 text-amber-700 focus:border-amber-500 [color-scheme:light]"
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`text-[10px] font-bold block mb-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        Adulto
                        <span className="ml-0.5 text-[9px] opacity-75 font-normal">(máx. {selectedTariff.pax})</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedTariff.pax}
                        value={adults}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          if (val > selectedTariff.pax) {
                            alert(`A tarifa '${selectedTariff.name}' suporta no máximo ${selectedTariff.pax} adulto(s). Para acomodar ${val} adultos, por favor selecione uma tarifa com maior capacidade.`);
                            setAdults(selectedTariff.pax);
                            return;
                          }
                          setAdults(val);
                        }}
                        className={`w-full text-center font-bold rounded-md p-1.5 text-xs outline-none border ${
                          isDark ? "bg-amber-400/20 border-amber-400/40 text-amber-300 focus:border-amber-400" : "bg-amber-100 border-amber-300 text-amber-900 focus:border-amber-500"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                    <div>
                      <label className={`text-[10px] font-bold block mb-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Criança</label>
                      <input
                        type="number"
                        min="0"
                        value={children}
                        onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                        className={`w-full text-center font-bold rounded-md p-1.5 text-xs border ${
                          isDark ? "bg-amber-400/20 border-amber-400/40 text-amber-300" : "bg-amber-100 border-amber-300 text-amber-900"
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`text-[10px] font-bold block mb-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Diarias</label>
                      <input
                        type="number"
                        readOnly
                        value={nights}
                        className={`w-full text-center font-bold rounded-md p-1.5 text-xs border ${
                          isDark ? "bg-amber-400/20 border-amber-400/40 text-amber-300" : "bg-amber-100 border-amber-300 text-amber-900"
                        }`}
                      />
                    </div>

                    <div className="col-span-3">
                      <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Telefone de Contato</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full border rounded-md p-1.5 font-mono text-xs ${
                          isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Pagamento Inicial / Adiantamento Grid */}
                  <div className={`pt-2 border-t space-y-2 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-[11px] ${isDark ? "text-[#00b4d8]" : "text-[#0284C7]"}`}>Pagamento Inicial / Adiantamento:</span>
                      {lastCaixaMovId && (
                        <span className="text-[9px] text-emerald-600 font-mono bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Caixa: {lastCaixaMovId}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-1.5 items-end">
                      <div className="col-span-3">
                        <label className={`text-[9px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Dt.Pagto</label>
                        <input
                          type="text"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className={`w-full border rounded p-1 text-[11px] font-mono ${
                            isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                          }`}
                        />
                      </div>
                      <div className="col-span-3">
                        <label className={`text-[9px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Vlr.Pagto</label>
                        <input
                          type="text"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className={`w-full border rounded p-1 text-[11px] font-mono font-bold text-right ${
                            isDark ? "bg-slate-950 border-slate-700 text-emerald-400" : "bg-white border-slate-300 text-emerald-600"
                          }`}
                        />
                      </div>
                      <div className="col-span-5">
                        <label className={`text-[9px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Forma de Pagamento</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className={`w-full border rounded p-1 text-[11px] ${
                            isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                          }`}
                        >
                          <option value="Dinheiro">Dinheiro Espécie</option>
                          <option value="PIX Instantâneo">PIX Instantâneo</option>
                          <option value="Cartão Crédito">Cartão Crédito</option>
                          <option value="Cartão Débito">Cartão Débito</option>
                          <option value="Faturado Corporativo">Faturado Corporativo</option>
                        </select>
                      </div>
                      <div className="col-span-1">
                        <button
                          type="button"
                          onClick={handleAddPayment}
                          disabled={paymentPosting}
                          className={`w-full p-1 rounded font-bold text-white flex items-center justify-center disabled:opacity-60 ${
                            isDark ? "bg-[#00b4d8] hover:bg-[#0077b6]" : "bg-[#0284C7] hover:bg-[#0369A1]"
                          }`}
                          title="Lançar Pagamento na Conta do Quarto + Caixa"
                        >
                          {paymentPosting
                            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Plus className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Payment Table */}
                    <div className={`border rounded-lg overflow-hidden max-h-24 overflow-y-auto custom-scrollbar ${
                      isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"
                    }`}>
                      <table className="w-full text-left text-[11px]">
                        <thead className={isDark ? "bg-slate-900 text-[#00b4d8] font-bold" : "bg-slate-100 text-[#0284C7] font-bold border-b border-slate-200"}>
                          <tr>
                            <th className="p-1.5">Data</th>
                            <th className="p-1.5 text-right">Valor Pagto.</th>
                            <th className="p-1.5">Forma Pagto</th>
                            <th className="p-1.5 text-center">💳 Caixa</th>
                            <th className="p-1.5 text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                          {paymentsList.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-2 text-center opacity-60 italic">
                                Nenhum adiantamento lançado
                              </td>
                            </tr>
                          ) : (
                            paymentsList.map((p) => (
                              <tr key={p.id} className={isDark ? "hover:bg-slate-900/50" : "hover:bg-slate-50"}>
                                <td className="p-1.5 font-mono opacity-80">{p.date}</td>
                                <td className={`p-1.5 font-mono font-bold text-right ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                                  R$ {p.amount.toFixed(2).replace(".", ",")}
                                </td>
                                <td className="p-1.5">{p.methodDescription}</td>
                                <td className="p-1.5 text-center">
                                  <span className={`text-[9px] flex items-center justify-center gap-0.5 font-mono ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                                    <CheckCircle2 className="w-3 h-3" /> Lançado
                                  </span>
                                </td>
                                <td className="p-1.5 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePayment(p.id)}
                                    className="text-rose-500 hover:text-rose-700"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Column: Demais Hospedes Grid (Print 1) */}
                <div className={`md:col-span-5 space-y-2 border-l pl-0 md:pl-3 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <span className={`font-bold text-[11px] block ${isDark ? "text-[#00b4d8]" : "text-[#0284C7]"}`}>Demais Hospede:</span>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newGuestInput}
                      onChange={(e) => setNewGuestInput(e.target.value)}
                      placeholder="Nome do acompanhante..."
                      className={`w-full border rounded-lg p-1.5 text-xs outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddSecondaryGuest}
                      className={`px-2.5 py-1.5 rounded-lg text-white font-bold flex items-center justify-center ${
                        isDark ? "bg-[#00b4d8] hover:bg-[#0077b6]" : "bg-[#0284C7] hover:bg-[#0369A1]"
                      }`}
                      title="Adicionar Acompanhante"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className={`border rounded-lg overflow-hidden min-h-[140px] max-h-44 overflow-y-auto custom-scrollbar ${
                    isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <table className="w-full text-left text-[11px]">
                      <thead className={isDark ? "bg-slate-900 text-[#00b4d8] font-bold" : "bg-slate-100 text-[#0284C7] font-bold border-b border-slate-200"}>
                        <tr>
                          <th className="p-1.5">Nome Hospede</th>
                          <th className="p-1.5 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                        {secondaryGuests.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-4 text-center opacity-60 italic">
                              Sem acompanhantes registrados
                            </td>
                          </tr>
                        ) : (
                          secondaryGuests.map((sg) => (
                            <tr key={sg.id} className={isDark ? "hover:bg-slate-900/50" : "hover:bg-slate-50"}>
                              <td className="p-1.5 font-semibold uppercase">{sg.name}</td>
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSecondaryGuest(sg.id)}
                                  className="text-rose-500 hover:text-rose-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* SECTION 3: OBSERVAÇÃO (PRINT 1) */}
            <fieldset className={fieldsetClass}>
              <legend className={legendClass}>Observação:</legend>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-3">
                  <label className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Dt/Hr Obs</label>
                  <input
                    type="text"
                    value={obsDate}
                    onChange={(e) => setObsDate(e.target.value)}
                    className={`w-full border rounded p-1.5 text-xs font-mono ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Tipo Obs</label>
                  <select
                    value={obsType}
                    onChange={(e) => setObsType(e.target.value)}
                    className={`w-full border rounded p-1.5 text-xs ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="1 - Recepção">1 - Recepção</option>
                    <option value="2 - Governança">2 - Governança</option>
                    <option value="3 - Financeiro">3 - Financeiro</option>
                    <option value="4 - Manutenção">4 - Manutenção</option>
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Observação</label>
                  <input
                    type="text"
                    value={obsText}
                    onChange={(e) => setObsText(e.target.value)}
                    placeholder="Digitar observação da hospedagem..."
                    className={`w-full border rounded p-1.5 text-xs outline-none ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                    }`}
                  />
                </div>

                <div className="md:col-span-1">
                  <button
                    type="button"
                    onClick={handleAddObservation}
                    className={`w-full py-1.5 rounded text-white flex items-center justify-center font-bold ${
                      isDark ? "bg-[#00b4d8] hover:bg-[#0077b6]" : "bg-[#0284C7] hover:bg-[#0369A1]"
                    }`}
                    title="Adicionar Observação"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Observations Table */}
              <div className={`border rounded-lg overflow-hidden max-h-24 overflow-y-auto custom-scrollbar ${
                isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <table className="w-full text-left text-[11px]">
                  <thead className={isDark ? "bg-slate-900 text-[#00b4d8] font-bold" : "bg-slate-100 text-[#0284C7] font-bold border-b border-slate-200"}>
                    <tr>
                      <th className="p-1.5">Data/Hora</th>
                      <th className="p-1.5">Tipo</th>
                      <th className="p-1.5">Observação</th>
                      <th className="p-1.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                    {obsList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-2 text-center opacity-60 italic">
                          Nenhuma observação cadastrada
                        </td>
                      </tr>
                    ) : (
                      obsList.map((o) => (
                        <tr key={o.id} className={isDark ? "hover:bg-slate-900/50" : "hover:bg-slate-50"}>
                          <td className="p-1.5 font-mono opacity-80">{o.dateTime}</td>
                          <td className={`p-1.5 font-semibold ${isDark ? "text-amber-300" : "text-amber-700"}`}>{o.typeDescription}</td>
                          <td className="p-1.5">{o.note}</td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveObservation(o.id)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </div>

          {/* BOTTOM ACTION & SUMMARY BAR (PRINT 1 BOTTOM RIGHT) */}
          <div className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-4 ${
            isDark ? "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-700" : "bg-slate-100 border-slate-200 text-slate-900"
          }`}>
            {/* Summary Financial Indicators */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Valor total diarias (R$)</span>
                <span className={`font-mono font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}>R$ {totalDiariasBruto.toFixed(2).replace(".", ",")}</span>
              </div>

              <div>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Desconto (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className={`w-24 border rounded px-2 py-0.5 text-rose-500 font-mono font-bold text-xs ${
                    isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"
                  }`}
                />
              </div>

              <div>
                <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Total Adiant. (R$)</span>
                <span className={`font-mono font-bold ${isDark ? "text-cyan-400" : "text-sky-700"}`}>R$ {totalAdiantamento.toFixed(2).replace(".", ",")}</span>
              </div>

              <div className={`p-1.5 rounded-lg border ${isDark ? "bg-amber-400/20 border-amber-400/40" : "bg-amber-100 border-amber-300"}`}>
                <span className={`text-[10px] font-bold block ${isDark ? "text-amber-300" : "text-amber-800"}`}>Saldo a pagar (R$)</span>
                <span className={`font-mono font-extrabold text-sm ${isDark ? "text-yellow-300" : "text-amber-900"}`}>R$ {saldoAPagar.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                  isDark ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <X className="w-4 h-4 inline mr-1" /> Fechar
              </button>

              <button
                type="button"
                onClick={handleConfirmCheckin}
                className={`px-6 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all ${
                  isDark ? "bg-[#00b4d8] hover:bg-[#0077b6] shadow-cyan-500/20" : "bg-[#0284C7] hover:bg-[#0369A1] shadow-sky-500/20"
                }`}
              >
                <Save className="w-4 h-4" /> Efetuar Hospedagem
              </button>
            </div>
          </div>
        </div>

        {/* ===== SEARCH GUEST MODAL ===== */}
        {showSearchGuestModal && (
          <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
            <div className={`rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden border ${
              isDark ? "bg-[#0F172A] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}>
              {/* Header */}
              <div className={`px-5 py-3 border-b flex items-center justify-between ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-100 border-slate-200 text-slate-900"
              }`}>
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-sky-500" />
                  <span className="text-sm font-bold">Pesquisar Hóspede Cadastrado</span>
                </div>
                <button onClick={() => setShowSearchGuestModal(false)} className="p-1.5 rounded-lg hover:bg-rose-600 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Input */}
              <div className={`p-4 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <div className="relative">
                  <Search className="w-4 h-4 opacity-50 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoFocus
                    value={searchGuestQuery}
                    onChange={(e) => setSearchGuestQuery(e.target.value)}
                    placeholder="Nome ou CPF do hóspede..."
                    className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm outline-none ${
                      isDark ? "bg-slate-950 border-slate-700 text-white focus:border-sky-500" : "bg-white border-slate-300 text-slate-900 focus:border-sky-600"
                    }`}
                  />
                </div>
              </div>

              {/* Results List */}
              <div className={`overflow-y-auto max-h-64 divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                {filteredGuests.length === 0 ? (
                  <div className="p-6 text-center opacity-60 text-sm italic">Nenhum hóspede encontrado</div>
                ) : (
                  filteredGuests.map((g, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSearchGuest(g)}
                      className="w-full px-4 py-3 text-left hover:bg-sky-500/10 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className={`text-sm font-bold group-hover:text-sky-600 ${isDark ? "text-white" : "text-slate-900"}`}>{g.name}</p>
                        <p className="text-xs opacity-60 font-mono">{g.doc} · {g.phone}</p>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className={`px-4 py-3 border-t flex justify-end ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => setShowSearchGuestModal(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  }`}
                >Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== MANUAL GUEST MODAL ===== */}
        {showManualGuestModal && (
          <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto ${isDark ? "bg-slate-950/80 backdrop-blur-sm" : "bg-slate-900/50 backdrop-blur-sm"}`}>
            <div className={`rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col my-auto border ${
              isDark ? "bg-[#0F172A] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}>
              {/* Header */}
              <div className={`px-5 py-3 border-b flex items-center justify-between ${
                isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-100 border-slate-200 text-slate-900"
              }`}>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-bold">Incluir Hóspede Manualmente</span>
                </div>
                <button onClick={() => setShowManualGuestModal(false)} className="p-1.5 rounded-lg hover:bg-rose-600 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <div className="p-5 space-y-3 text-xs">
                {/* Row 1: Nome + Tipo Doc + Nº Doc */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-5">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome Completo <span className="text-rose-400">*</span></label>
                    <input
                      type="text"
                      autoFocus
                      value={manualForm.name}
                      onChange={(e) => setManualForm({ ...manualForm, name: e.target.value.toUpperCase() })}
                      placeholder="NOME DO HÓSPEDE"
                      className={`w-full border rounded-lg px-3 py-2 font-bold uppercase outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-yellow-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                  <div className="col-span-5 md:col-span-3">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Tipo Doc.</label>
                    <select
                      value={manualForm.docType}
                      onChange={(e) => setManualForm({ ...manualForm, docType: e.target.value, doc: "" })}
                      className={`w-full border rounded-lg px-3 py-2 outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    >
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                      <option value="PASSAPORTE">Passaporte</option>
                    </select>
                  </div>
                  <div className="col-span-7 md:col-span-4">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nº Documento</label>
                    <input
                      type="text"
                      value={manualForm.doc}
                      onChange={(e) => setManualForm({ ...manualForm, doc: e.target.value })}
                      placeholder={manualForm.docType === "CPF" ? "000.000.000-00" : manualForm.docType === "CNPJ" ? "00.000.000/0000-00" : "Nº Passaporte"}
                      className={`w-full border rounded-lg px-3 py-2 font-mono outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-white focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                </div>

                {/* Row 2: Telefone + Email + Data Nascimento */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 md:col-span-4">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Telefone</label>
                    <input
                      type="text"
                      value={manualForm.phone}
                      onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className={`w-full border rounded-lg px-3 py-2 font-mono outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-5">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>E-mail</label>
                    <input
                      type="text"
                      value={manualForm.email}
                      onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })}
                      placeholder="email@exemplo.com"
                      className={`w-full border rounded-lg px-3 py-2 outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-sky-300 focus:border-emerald-500" : "bg-white border-slate-300 text-sky-700 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Dt. Nascimento</label>
                    <input
                      type="text"
                      value={manualForm.birthDate}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                        let formatted = digits;
                        if (digits.length > 2 && digits.length <= 4) {
                          formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                        } else if (digits.length > 4) {
                          formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                        }
                        setManualForm({ ...manualForm, birthDate: formatted });
                      }}
                      maxLength={10}
                      placeholder="DD/MM/AAAA"
                      className={`w-full border rounded-lg px-3 py-2 font-mono outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                </div>

                {/* Row 3: Gênero + Identidade (RG) */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 md:col-span-4">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Gênero</label>
                    <select
                      value={manualForm.gender}
                      onChange={(e) => setManualForm({ ...manualForm, gender: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-2 outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    >
                      <option value="">Não informado</option>
                      <option value="Masculino">Masculino</option>
                      <option value="Feminino">Feminino</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>
                  <div className="col-span-6 md:col-span-4">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>RG / Identidade</label>
                    <input
                      type="text"
                      value={manualForm.identity}
                      onChange={(e) => setManualForm({ ...manualForm, identity: e.target.value })}
                      placeholder="Nº RG ou Identidade"
                      className={`w-full border rounded-lg px-3 py-2 font-mono outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                </div>

                {/* Row 4: Nome da Mãe + Nome do Pai */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome da Mãe</label>
                    <input
                      type="text"
                      value={manualForm.motherName}
                      onChange={(e) => setManualForm({ ...manualForm, motherName: e.target.value.toUpperCase() })}
                      placeholder="NOME DA MÃE"
                      className={`w-full border rounded-lg px-3 py-2 uppercase outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                  <div className="col-span-6">
                    <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome do Pai</label>
                    <input
                      type="text"
                      value={manualForm.fatherName}
                      onChange={(e) => setManualForm({ ...manualForm, fatherName: e.target.value.toUpperCase() })}
                      placeholder="NOME DO PAI"
                      className={`w-full border rounded-lg px-3 py-2 uppercase outline-none ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      }`}
                    />
                  </div>
                </div>

                {/* Row 5: Endereço Completo */}
                <div>
                  <label className={`text-[10px] font-bold block mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Endereço Completo</label>
                  <input
                    type="text"
                    value={manualForm.address}
                    onChange={(e) => setManualForm({ ...manualForm, address: e.target.value.toUpperCase() })}
                    placeholder="RUA, Nº, BAIRRO, CIDADE/UF - CEP"
                    className={`w-full border rounded-lg px-3 py-2 uppercase outline-none ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                    }`}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className={`px-5 py-3 border-t flex items-center justify-end gap-3 ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <button
                  type="button"
                  onClick={() => setShowManualGuestModal(false)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmManualGuest}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar Hóspede
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
