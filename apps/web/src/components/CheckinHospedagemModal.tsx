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
  Star,
  Lock,
  Moon,
  ShieldCheck,
  AlertTriangle
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";
import DateRangeCalendarPicker from "@/components/DateRangeCalendarPicker";
import AdminAuthorizationModal from "@/components/AdminAuthorizationModal";
import { validateCPF, validateCNPJ, formatCPF, formatCNPJ } from "@/lib/documentValidation";

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
    guestCpf?: string;
    cpf?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    gender?: string;
    motherName?: string;
    fatherName?: string;
    identity?: string;
    fullAddress?: string;
    address?: string;
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
    children?: number;
    totalAmount?: number;
    depositPaid?: number;
    tariffName?: string;
    dailyRate?: number;
    notes?: string;
    observations?: ObservationItem[] | string[];
    payments?: PaymentItem[];
    roomId?: string;
    roomNumber?: string;
  };
  onSuccess: (checkinData: any) => void;
}

// Formatters & Validators — implementação real vive em @/lib/documentValidation (compartilhada
// com o backend); reexportadas aqui para não quebrar quem já importa deste arquivo (ex: LancarReservaModal).
export { validateCPF, validateCNPJ, formatCPF, formatCNPJ };

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

// Horário a partir do qual uma chegada é considerada "de madrugada" — ou seja, muito
// antes do horário padrão de check-in, quando o hóspede efetivamente já dormiu no quarto
// na noite anterior à diária "oficial". Segue a prática comum de rollover/night-audit dos
// PMS (tipicamente entre 3h e 5h da manhã) com uma margem de segurança até as 6h.
export const MADRUGADA_CUTOFF_TIME = "06:00";

function nowHHMM(): string {
  const now = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Uma chegada é "de madrugada" quando ocorre entre 00:00 e o corte (MADRUGADA_CUTOFF_TIME),
// isto é, muito antes do horário padrão de check-in — cenário que exige decisão do operador
// sobre cobrança da noite anterior (ver EarlyArrivalDecisionPanel).
function isMadrugadaArrival(hhmm: string): boolean {
  return hhmm < MADRUGADA_CUTOFF_TIME;
}

// Horário efetivo do check-in:
// - Chegada de madrugada (antes do corte): grava-se o horário REAL da chegada — nunca o
//   horário padrão, que ficaria no futuro e mascararia a ocupação real do quarto.
// - Chegada entre o corte e o horário padrão configurado: assume-se o horário padrão
//   (normaliza pequenas antecipações comuns, ex: recepção processa às 13h50).
// - Chegada depois do horário padrão: grava-se o horário real (check-in tardio).
function resolveCheckinTime(defaultCheckInTime: string): string {
  const hhmm = nowHHMM();
  if (isMadrugadaArrival(hhmm)) return hhmm;
  return hhmm > defaultCheckInTime ? hhmm : defaultCheckInTime;
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

// Add N days to a "YYYY-MM-DD" string using local date parts (avoids the UTC-parsing
// off-by-one that `new Date("YYYY-MM-DD")` causes in timezones behind UTC).
function addDaysToYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
// ──────────────────────────────────────────────────────────────────────────────

export default function CheckinHospedagemModal({
  isOpen,
  onClose,
  roomData,
  reservationData,
  onSuccess,
}: CheckinHospedagemModalProps) {
  const { defaultCheckInTime, defaultCheckOutTime, theme } = useTheme();
  const toast = useToast();
  const { operatorId: activeOperatorId, operatorName: activeOperatorName } = useOperator();
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
    reservationData?.cpf || reservationData?.guestCpf || ""
  );
  const [guestName, setGuestName] = useState(reservationData?.guestName || "");
  const [phone, setPhone] = useState(reservationData?.phone || "");

  // Refs para prevenir reset indevido de campos durante re-renders (ex: polling do mapa de quartos)
  const prevIsOpenRef = useRef<boolean>(false);
  const prevRoomNumberRef = useRef<string | null>(null);
  const prevResIdRef = useRef<string | null>(null);

  // Sincronizar dados quando o modal abre (com ou sem reserva de origem)
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    const currentResId = reservationData?.reservationNumber || (reservationData as any)?.id || null;
    const currentRoomNum = roomData?.number || null;

    const justOpened = !prevIsOpenRef.current;
    const roomChanged = currentRoomNum !== prevRoomNumberRef.current;
    const resChanged = currentResId !== prevResIdRef.current;

    // Se o modal já está aberto e o quarto/reserva não mudou, ignorar (preserva o que o usuário está digitando)
    if (!justOpened && !roomChanged && !resChanged) {
      return;
    }

    prevIsOpenRef.current = true;
    prevRoomNumberRef.current = currentRoomNum;
    prevResIdRef.current = currentResId;

    if (reservationData) {
      // ── ORIGEM: RESERVA ─────────────────────────────────────────────────────
      const nameUpper = (reservationData.guestName || "").toUpperCase();
      setGuestName(nameUpper);

      const resCpf = reservationData.cpf || reservationData.guestCpf || "";
      const resPhone = reservationData.phone || "";
      setDocNumber(resCpf);
      setPhone(resPhone);

      if (resPhone) {
        setVerifiedPhones([
          {
            id: `TEL-1`,
            number: resPhone,
            hasWhatsapp: true,
            nomeUsuarioWpp: (nameUpper || "hospede").toLowerCase().replace(/\s+/g, ".") + ".wpp",
            whatsappName: nameUpper,
            isPrimary: true,
          },
        ]);
        setWhatsappPhone(resPhone);
        setHasWhatsapp(true);
      } else {
        setVerifiedPhones([]);
        setWhatsappPhone("");
        setHasWhatsapp(false);
      }

      setBirthDate(reservationData.birthDate || "");
      setGender(reservationData.gender || "");
      setMotherName(reservationData.motherName || "");
      setFatherName(reservationData.fatherName || "");
      setIdentity(reservationData.identity || "");
      setFullAddress(reservationData.fullAddress || reservationData.address || "");
      setEmail(reservationData.email || "");

      // Consultar banco de dados se hóspede já possui cadastro
      const queryTerm = resCpf.replace(/\D/g, "") || nameUpper;
      if (queryTerm) {
        fetch(`/api/cadastros/hospedes?q=${encodeURIComponent(queryTerm)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.success && Array.isArray(data.guests) && data.guests.length > 0) {
              const matchedGuest = data.guests[0];
              setGuestName(matchedGuest.fullName?.toUpperCase() || nameUpper);
              setDocNumber(matchedGuest.cpf || resCpf);
              setPhone(matchedGuest.phone || matchedGuest.whatsappPhone || resPhone);
              setBirthDate(matchedGuest.birthDate || reservationData.birthDate || "");
              setGender(matchedGuest.gender || reservationData.gender || "");
              setMotherName(matchedGuest.motherName || reservationData.motherName || "");
              setFatherName(matchedGuest.fatherName || reservationData.fatherName || "");
              setIdentity(matchedGuest.identity || reservationData.identity || "");
              setFullAddress(matchedGuest.address || reservationData.fullAddress || reservationData.address || "");
              setEmail(matchedGuest.email || reservationData.email || "");
              setHubGuestSaved(true);
              setHubMessage(`✓ Hóspede '${matchedGuest.fullName}' localizado e verificado no cadastro com sucesso.`);
            } else if (resCpf) {
              setHubGuestSaved(true);
              setHubMessage(`✓ Hóspede '${nameUpper}' vinculado com documento ${resCpf}.`);
            } else {
              setHubGuestSaved(false);
              setHubMessage(`⚠️ Hóspede '${nameUpper}' selecionado da reserva. Complete os dados do cadastro.`);
            }
          })
          .catch(() => {
            setHubGuestSaved(!!resCpf);
            setHubMessage(resCpf ? `✓ Hóspede '${nameUpper}' vinculado.` : `⚠️ Complete o cadastro do hóspede.`);
          });
      } else {
        setHubGuestSaved(false);
        setHubMessage(`⚠️ Hóspede vindo da reserva. Complete os dados para efetivar.`);
      }

      // Tarifa escolhida na reserva. Se a reserva não tiver um valor de diária definido,
      // NUNCA usar o valor TOTAL da reserva como se fosse o valor de uma única diária —
      // isso cobraria o hóspede várias vezes o valor combinado numa estadia de N noites.
      // Em vez disso, o total é dividido pelo número de noites da própria reserva.
      const reservationNights = (() => {
        try {
          const inLocal = reservationData.checkInDate ? brDateTimeToLocal(reservationData.checkInDate) : "";
          const outLocal = reservationData.checkOutDate ? brDateTimeToLocal(reservationData.checkOutDate) : "";
          if (!inLocal || !outLocal) return 1;
          const [y1, m1, d1] = localToDateOnly(inLocal).split("-").map(Number);
          const [y2, m2, d2] = localToDateOnly(outLocal).split("-").map(Number);
          const diffMs = new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
          return Math.max(1, Math.round(diffMs / (1000 * 3600 * 24)));
        } catch {
          return 1;
        }
      })();
      const reservationPerNightRate =
        reservationData.dailyRate ||
        (reservationData.totalAmount ? reservationData.totalAmount / reservationNights : 0);

      if (reservationData.tariffName) {
        const matched = LISTA_TARIFAS.find(
          (t) => t.name.toLowerCase() === reservationData.tariffName?.toLowerCase()
        );
        if (matched) {
          setSelectedTariff(matched);
        } else {
          setSelectedTariff({
            id: `TAR-RES`,
            name: reservationData.tariffName.toUpperCase(),
            pax: 1,
            price: reservationPerNightRate || 170,
          });
        }
      } else if (roomData?.category) {
        const matchedCat = LISTA_TARIFAS.find((t) => t.name.toUpperCase().includes(roomData.category!.toUpperCase()));
        if (matchedCat) setSelectedTariff(matchedCat);
      }
      setDailyRate(
        reservationPerNightRate ||
        roomData?.ratePerNight ||
        LISTA_TARIFAS[0].price
      );

      // Período da reserva — o check-in é sempre efetivado na data de hoje (nunca superior
      // nem inferior), independente da data originalmente reservada. Apenas a saída prevista
      // é herdada da reserva (quando ainda for uma data futura válida).
      setDtChegadaLocal(buildLocalDateTime(todayDateStr(), resolveCheckinTime(defaultCheckInTime)));
      const reservedCheckoutLocal = reservationData.checkOutDate ? brDateTimeToLocal(reservationData.checkOutDate) : "";
      if (reservedCheckoutLocal && localToDateOnly(reservedCheckoutLocal) > todayDateStr()) {
        setDtSaidaLocal(reservedCheckoutLocal);
      } else {
        setDtSaidaLocal(buildLocalDateTime(tomorrowDateStr(), defaultCheckOutTime));
      }
      setAdults(reservationData.adults || 1);
      setChildren(reservationData.children || 0);
      setEarlyArrivalChoice(null);
      setEarlyArrivalFixedFeeInput("0,00");
      setEarlyArrivalFixedFeeAuthorized(false);
      setEarlyArrivalCourtesyAuthorized(false);
      setEarlyArrivalAuthorizedBy(null);
      setAdminAuthPurpose(null);

      // Observações da reserva
      if (Array.isArray(reservationData.observations) && reservationData.observations.length > 0) {
        setObsList(reservationData.observations as any);
      } else if (reservationData.notes && reservationData.notes.trim()) {
        const nowStr = new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR").slice(0, 5);
        setObsList([
          {
            id: `OBS-RES-1`,
            dateTime: nowStr,
            typeDescription: "1 - Reserva de Origem",
            note: reservationData.notes.trim(),
          },
        ]);
      } else {
        setObsList([]);
      }

      // Pagamentos/Adiantamentos da reserva
      if (Array.isArray(reservationData.payments) && reservationData.payments.length > 0) {
        setPaymentsList(reservationData.payments as any);
      } else if (reservationData.depositPaid && reservationData.depositPaid > 0) {
        setPaymentsList([
          {
            id: `PAY-RES-1`,
            date: new Date().toLocaleDateString("pt-BR"),
            amount: reservationData.depositPaid,
            methodDescription: "Adiantamento Reserva (PIX)",
          },
        ]);
      } else {
        setPaymentsList([]);
      }
    } else {
      // ── ORIGEM: DIRETA NO QUARTO (SEM RESERVA / WALK-IN) ─────────────────
      // Todos os campos zerados / em branco
      setDocType("CPF");
      setDocNumber("");
      setGuestName("");
      setPhone("");
      setVerifiedPhones([]);
      setWhatsappPhone("");
      setNomeUsuarioWpp("");
      setWhatsappName("");
      setHasWhatsapp(false);
      setBirthDate("");
      setGender("");
      setMotherName("");
      setFatherName("");
      setIdentity("");
      setFullAddress("");
      setEmail("");
      setTelephonesList([]);
      setEmailsList([]);
      setSecondaryGuests([]);
      setPaymentsList([]);
      setPaymentAmount("0,00");
      setObsList([]);
      setObsText("");
      setDiscount(0);
      setHubGuestSaved(false);
      setHubMessage(null);
      setShowGuestData(false);
      setDateError(null);
      setAdults(1);
      setChildren(0);
      setDtChegadaLocal(buildLocalDateTime(todayDateStr(), resolveCheckinTime(defaultCheckInTime)));
      setDtSaidaLocal(buildLocalDateTime(tomorrowDateStr(), defaultCheckOutTime));
      setEarlyArrivalChoice(null);
      setEarlyArrivalFixedFeeInput("0,00");
      setEarlyArrivalFixedFeeAuthorized(false);
      setEarlyArrivalCourtesyAuthorized(false);
      setEarlyArrivalAuthorizedBy(null);
      setAdminAuthPurpose(null);

      if (roomData?.category) {
        const catUpper = roomData.category.toUpperCase();
        const matchedCat = LISTA_TARIFAS.find((t) => {
          const tName = t.name.toUpperCase();
          return tName.includes(catUpper) || (catUpper.includes("STANDARD") && tName.includes("STANDAR"));
        });
        if (matchedCat) {
          setSelectedTariff(matchedCat);
          setDailyRate(roomData.ratePerNight || matchedCat.price);
        } else {
          setSelectedTariff(LISTA_TARIFAS[0]);
          setDailyRate(roomData?.ratePerNight || LISTA_TARIFAS[0].price);
        }
      } else {
        setSelectedTariff(LISTA_TARIFAS[0]);
        setDailyRate(roomData?.ratePerNight || LISTA_TARIFAS[0].price);
      }
    }
  }, [isOpen, reservationData, roomData?.number, roomData?.category, roomData?.ratePerNight, defaultCheckInTime, defaultCheckOutTime]);

  // Busca o percentual máximo de desconto sem autorização de admin (Configurações do assinante)
  // sempre que o modal abre, e reseta a autorização de desconto de uma sessão de check-in anterior.
  useEffect(() => {
    if (!isOpen) return;
    setDiscountAuthorized(false);
    setDiscountAuthorizedBy(null);
    fetch("/api/tenant/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && typeof data.settings?.maxDiscountPercent === "number") {
          setMaxDiscountPercent(data.settings.maxDiscountPercent);
        }
      })
      .catch(() => {});
  }, [isOpen]);

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
  // O check-in é sempre efetivado na data de hoje (nunca superior nem inferior).
  const buildInitialCheckin = () => buildLocalDateTime(todayDateStr(), resolveCheckinTime(defaultCheckInTime));

  const buildInitialCheckout = (checkoutTime: string) => {
    if (reservationData?.checkOutDate) {
      const reservedLocal = brDateTimeToLocal(reservationData.checkOutDate);
      if (reservedLocal && localToDateOnly(reservedLocal) > todayDateStr()) return reservedLocal;
    }
    return buildLocalDateTime(tomorrowDateStr(), checkoutTime);
  };

  const [dtChegadaLocal, setDtChegadaLocal] = useState<string>(buildInitialCheckin);
  const [dtSaidaLocal, setDtSaidaLocal] = useState<string>(() => buildInitialCheckout(defaultCheckOutTime));

  // Keep BR-formatted versions for display & payload
  const dtChegada = localToBrDateTime(dtChegadaLocal);
  const dtSaida = localToBrDateTime(dtSaidaLocal);

  // Date validation state
  const [dateError, setDateError] = useState<string | null>(null);

  // Popover do calendário de seleção de período (estilo WinDev)
  const [showDateRangePicker, setShowDateRangePicker] = useState<boolean>(false);

  // ── Decisão de chegada de madrugada (check-in muito antes do horário padrão) ──
  // Quando detectado (ver MADRUGADA_CUTOFF_TIME), o operador precisa decidir como tratar a
  // noite anterior antes de conseguir efetivar a hospedagem: diária extra, meia diária, taxa
  // fixa, ou cortesia. Cortesia sempre exige senha de administrador; taxa fixa só exige quando
  // o valor digitado é inferior à metade da diária (para impedir desconto informal exagerado).
  type EarlyArrivalChoice = "EXTRA_NIGHT" | "HALF_NIGHT" | "FIXED_FEE" | "COURTESY";
  const [earlyArrivalChoice, setEarlyArrivalChoice] = useState<EarlyArrivalChoice | null>(null);
  const [earlyArrivalFixedFeeInput, setEarlyArrivalFixedFeeInput] = useState<string>("0,00");
  const [earlyArrivalFixedFeeAuthorized, setEarlyArrivalFixedFeeAuthorized] = useState<boolean>(false);
  const [earlyArrivalCourtesyAuthorized, setEarlyArrivalCourtesyAuthorized] = useState<boolean>(false);
  const [earlyArrivalAuthorizedBy, setEarlyArrivalAuthorizedBy] = useState<string | null>(null);
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);
  const [adminAuthPurpose, setAdminAuthPurpose] = useState<"COURTESY" | "LOW_FIXED_FEE" | "HIGH_DISCOUNT" | null>(null);

  // Desconto máximo (%) sem autorização de administrador — parametrizado por assinante em
  // Configurações (Tenant.maxDiscountPercent). 20 é só o valor inicial até a busca responder.
  const [maxDiscountPercent, setMaxDiscountPercent] = useState<number>(20);
  const [discountAuthorized, setDiscountAuthorized] = useState<boolean>(false);
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null);

  const [adults, setAdults] = useState<number>(reservationData?.adults || 1);
  const [children, setChildren] = useState<number>(reservationData?.children || 0);
  const [nights, setNights] = useState<number>(1);

  // Handler: change checkout — must not be before checkin, hour locked to configured time
  const handleDtSaidaChange = useCallback((newLocalVal: string) => {
    const checkinDate = localToDateOnly(dtChegadaLocal);
    const newCheckoutDate = localToDateOnly(newLocalVal);
    // Always override time portion with configured checkout time
    const correctedVal = buildLocalDateTime(newCheckoutDate, defaultCheckOutTime);

    if (newCheckoutDate < checkinDate) {
      setDateError("A data de saída não pode ser anterior à data de chegada.");
      // Set to next day after checkin
      setDtSaidaLocal(buildLocalDateTime(addDaysToYMD(checkinDate, 1), defaultCheckOutTime));
      return;
    }
    if (newCheckoutDate === checkinDate) {
      setDateError("A data de saída não pode ser igual à data de chegada. Mínimo 1 diária.");
      setDtSaidaLocal(buildLocalDateTime(addDaysToYMD(checkinDate, 1), defaultCheckOutTime));
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
  const [isSaving, setIsSaving] = useState(false);

  // Financial Calculations, Discount & Auto-registered Guest Info
  const [discount, setDiscount] = useState<number>(0);
  const [hubLoading, setHubLoading] = useState<boolean>(false);
  const [hubMessage, setHubMessage] = useState<string | null>(null);
  // Cache em memória (só dura enquanto o modal está aberto) do resultado já pago do Hub do
  // Desenvolvedor por CPF, para não debitar cota novamente ao reconsultar o mesmo CPF na mesma sessão.
  const hubCpfCacheRef = useRef<Map<string, any>>(new Map());
  
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
  const [dbGuests, setDbGuests] = useState<Array<{ name: string; doc: string; phone: string }>>([]);

  useEffect(() => {
    if (!showSearchGuestModal) return;
    const fetchGuests = async () => {
      try {
        const res = await fetch(`/api/cadastros/hospedes?q=${encodeURIComponent(searchGuestQuery)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.guests)) {
          setDbGuests(data.guests.map((g: any) => ({
            name: g.fullName || "",
            doc: g.cpf || "",
            phone: g.phone || g.whatsappPhone || "",
          })));
        } else {
          setDbGuests([]);
        }
      } catch (err) {
        console.error("Erro ao buscar hóspedes do banco:", err);
        setDbGuests([]);
      }
    };
    fetchGuests();
  }, [showSearchGuestModal, searchGuestQuery]);

  const filteredGuests = dbGuests;

  // Manual Guest Modal
  const [showManualGuestModal, setShowManualGuestModal] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    name: "", doc: "", docType: "CPF", phone: "",
    birthDate: "", gender: "", motherName: "", fatherName: "",
    identity: "", address: "", email: "",
  });

  const handleSelectSearchGuest = (guest: { name: string; doc: string; phone: string }) => {
    setGuestName(guest.name);
    setDocNumber(guest.doc);
    setPhone(guest.phone);
    setHubGuestSaved(true);
    setShowGuestData(false);
    setHubMessage(`✓ Hóspede '${guest.name}' localizado e verificado no cadastro com sucesso.`);
    setShowSearchGuestModal(false);
  };

  const handleConfirmManualGuest = () => {
    if (!manualForm.name.trim()) { toast.warning("Informe o nome do hóspede."); return; }
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

  // Calculate nights: diferença em dias de calendário entre chegada e saída
  // (o horário de chegada/saída não deve influenciar a contagem de diárias).
  useEffect(() => {
    try {
      const [y1, m1, d1] = localToDateOnly(dtChegadaLocal).split("-").map(Number);
      const [y2, m2, d2] = localToDateOnly(dtSaidaLocal).split("-").map(Number);
      const diffMs = new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 3600 * 24)));
      setNights(diffDays);
    } catch {
      setNights(1);
    }
  }, [dtChegadaLocal, dtSaidaLocal]);

  // Chegada de madrugada: detectada quando o horário efetivo da chegada (já resolvido em
  // resolveCheckinTime) cai antes do corte — exige decisão do operador sobre a noite anterior.
  const isMadrugadaCheckin = isMadrugadaArrival(dtChegadaLocal.split("T")[1] || "00:00");

  const earlyArrivalFixedFeeValue = parseFloat(earlyArrivalFixedFeeInput.replace(/\./g, "").replace(",", ".")) || 0;
  // Taxa fixa abaixo da metade da diária é tratada como desconto informal — exige autorização
  // de administrador, igual à cortesia, para evitar que o operador zere o valor sozinho.
  const earlyArrivalFixedFeeBelowHalf = earlyArrivalChoice === "FIXED_FEE" && earlyArrivalFixedFeeValue < dailyRate / 2;
  const earlyArrivalFixedFeeNeedsAuth = earlyArrivalFixedFeeBelowHalf && !earlyArrivalFixedFeeAuthorized;

  const earlyArrivalPending = isMadrugadaCheckin && (!earlyArrivalChoice || earlyArrivalFixedFeeNeedsAuth);

  const earlyArrivalCharge = !isMadrugadaCheckin
    ? 0
    : earlyArrivalChoice === "EXTRA_NIGHT"
    ? dailyRate
    : earlyArrivalChoice === "HALF_NIGHT"
    ? dailyRate / 2
    : earlyArrivalChoice === "FIXED_FEE"
    ? earlyArrivalFixedFeeValue
    : 0; // COURTESY ou ainda não decidido

  const earlyArrivalLabel =
    earlyArrivalChoice === "EXTRA_NIGHT" ? "Diária extra (chegada de madrugada)"
    : earlyArrivalChoice === "HALF_NIGHT" ? "Meia diária (chegada de madrugada)"
    : earlyArrivalChoice === "FIXED_FEE" ? (earlyArrivalFixedFeeBelowHalf ? `Taxa de chegada antecipada abaixo da meia diária (autorizado por ${earlyArrivalAuthorizedBy || "administrador"})` : "Taxa de chegada antecipada")
    : earlyArrivalChoice === "COURTESY" ? `Cortesia — chegada de madrugada (autorizado por ${earlyArrivalAuthorizedBy || "administrador"})`
    : "";

  // Total calculations
  const totalDiariasBruto = nights * dailyRate + earlyArrivalCharge;
  const totalAdiantamento = paymentsList.reduce((acc, item) => acc + item.amount, 0);
  const saldoAPagar = Math.max(0, totalDiariasBruto - discount - totalAdiantamento);

  // Desconto acima do percentual configurado em Configurações exige autorização de admin —
  // mesmo padrão já usado para cortesia/taxa reduzida na chegada de madrugada.
  const discountPercent = totalDiariasBruto > 0 ? (discount / totalDiariasBruto) * 100 : 0;
  const discountNeedsAuth = discount > 0 && discountPercent > maxDiscountPercent && !discountAuthorized;

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
      toast.warning("Por favor, digite um CPF válido com 11 dígitos para consultar no Hub do Desenvolvedor.");
      return;
    }
    setHubLoading(true);
    setHubMessage(null);
    setHubGuestSaved(false);

    try {
      // Antes de consultar a API externa (Hub do Desenvolvedor), verifica se o hóspede
      // já possui cadastro local. Se existir, carrega os dados do banco e não consulta a API.
      if (docType === "CPF") {
        const localRes = await fetch(`/api/cadastros/hospedes?q=${clean}`);
        const localData = await localRes.json();
        if (localData.success && Array.isArray(localData.guests)) {
          const matchedGuest = localData.guests.find((g: any) => (g.cpf || "").replace(/\D/g, "") === clean);
          if (matchedGuest) {
            setGuestName(matchedGuest.fullName?.toUpperCase() || guestName);
            setPhone(matchedGuest.phone || matchedGuest.whatsappPhone || phone);
            setWhatsappPhone(matchedGuest.whatsappPhone || matchedGuest.phone || "");
            setHasWhatsapp(!!matchedGuest.hasWhatsapp);
            if (matchedGuest.phone || matchedGuest.whatsappPhone) {
              setVerifiedPhones([{
                id: "TEL-1",
                number: matchedGuest.phone || matchedGuest.whatsappPhone,
                hasWhatsapp: !!matchedGuest.hasWhatsapp,
                nomeUsuarioWpp: (matchedGuest.fullName || guestName).toLowerCase().replace(/\s+/g, ".") + ".wpp",
                whatsappName: matchedGuest.fullName || guestName,
                isPrimary: true,
              }]);
            }
            setBirthDate(matchedGuest.birthDate ? String(matchedGuest.birthDate).slice(0, 10) : "");
            setGender(matchedGuest.gender || "");
            setIdentity(matchedGuest.cpf || clean);
            const addressParts = [matchedGuest.street, matchedGuest.number, matchedGuest.neighborhood, matchedGuest.city, matchedGuest.state, matchedGuest.country].filter(Boolean);
            setFullAddress(addressParts.join(", "));
            setEmail(matchedGuest.email || "");
            setHubGuestSaved(true);
            setHubMessage(`✓ Hóspede '${matchedGuest.fullName}' localizado no cadastro local. Consulta à API não é necessária.`);
            setHubLoading(false);
            return;
          }
        }
      }

      const cached = hubCpfCacheRef.current.get(clean);
      const data = cached ?? (await (await fetch(`/api/stay/hub-consult-cpf?cpf=${clean}`)).json());
      if (data.success && data.data) {
        if (!cached) hubCpfCacheRef.current.set(clean, data);
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

        // Grava o cadastro no banco assim que o Hub encontra o CPF — não só quando o check-in é
        // confirmado. Assim, se o operador fechar o modal sem completar a hospedagem e pesquisar
        // o mesmo CPF de novo depois, a busca local (acima) já encontra o cadastro e não gasta
        // outra consulta paga na API por engano.
        if (!cached) {
          fetch("/api/cadastros/hospedes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: d.nome || guestName,
              cpf: clean,
              birthDate: d.dataNascimento || null,
              gender: d.genero || null,
              email: d.email || null,
              phone: (d.telefones && d.telefones[0]) || d.telefone || null,
              motherName: d.nomeDaMae || null,
              fatherName: d.nomeDoPai || null,
              fullAddress: d.enderecoCompleto || null,
              street: d.logradouro || null,
              number: d.numero || null,
              neighborhood: d.bairro || null,
              city: d.cidade || null,
              state: d.uf || null,
              zipCode: d.cep || null,
            }),
          }).catch((err) => console.warn("[Check-in] Falha ao gravar hóspede consultado no Hub:", err));
        }

        setHubMessage(`✓ Hóspede '${d.nome}' localizado e cadastrado no banco de dados.`);
      } else {
        setHubMessage(`⚠️ ${data.message || "CPF não localizado na API."}`);
      }
    } catch {
      setHubMessage("⚠️ Não foi possível realizar a consulta do CPF no momento. Por favor, preencha os dados manualmente.");
      setHubGuestSaved(false);
    } finally {
      setHubLoading(false);
    }
  };

  // Add Secondary Guest — Coherence check against (selectedTariff.pax + children)
  const handleAddSecondaryGuest = () => {
    if (!newGuestInput.trim()) return;

    const maxCapacidadeTotal = selectedTariff.pax + children;
    const totalOccupants = 1 + secondaryGuests.length;
    if (totalOccupants >= maxCapacidadeTotal) {
      toast.warning(
        `A hospedagem atual permite no máximo ${maxCapacidadeTotal} pessoa(s) (${selectedTariff.pax} Adulto(s) da Tarifa + ${children} Criança(s)).\n\nPara incluir mais acompanhantes, adicione crianças ou selecione uma tarifa com maior capacidade de adultos (ex: Duplo ou Triplo).`,
        "Capacidade Máxima Atingida"
      );
      return;
    }

    setSecondaryGuests((prev) => [
      ...prev,
      { id: `SEC-${Date.now()}`, name: newGuestInput.trim().toUpperCase() },
    ]);
    setNewGuestInput("");
  };

  const handleRemoveSecondaryGuest = (id: string) => {
    setSecondaryGuests((prev) => prev.filter((g) => g.id !== id));
  };

  // Add Payment — enquanto a tela de check-in estiver aberta, o pagamento/adiantamento fica
  // SOMENTE na grade local (nada é gravado no banco). Só quando o usuário efetivar o check-in
  // (handleConfirmCheckin) é que esses lançamentos seguem seu fluxo real: crédito na conta do
  // quarto, lançamento no caixa etc — tudo dentro da mesma transação que cria a StayCheckin.
  const handleAddPayment = () => {
    const num = parseFloat(paymentAmount.replace(/\./g, "").replace(",", "."));
    if (isNaN(num) || num <= 0) {
      toast.warning("Informe um valor válido para o pagamento.");
      return;
    }

    setPaymentsList((prev) => [
      ...prev,
      {
        id: `PAY-${Date.now()}`,
        date: paymentDate,
        amount: num,
        methodDescription: paymentMethod,
      },
    ]);
    setPaymentAmount("0,00");
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
    // Trava contra duplo clique/duplo envio: sem isso, dois cliques rápidos no botão disparam
    // dois POSTs concorrentes para /api/stay/checkin com o mesmo reservationId, e o segundo
    // falha com "Unique constraint failed on the fields: (reservationId)".
    if (isSaving) return;

    // Validations
    if (earlyArrivalPending) {
      toast.error(
        `Esta chegada foi registrada de madrugada (${dtChegada.slice(11, 16)}), bem antes do horário padrão de check-in.\n\nDefina abaixo como tratar a noite anterior (diária extra, meia diária, taxa fixa ou cortesia) antes de efetivar a hospedagem.`,
        "Decisão de Chegada de Madrugada Pendente"
      );
      return;
    }

    if (discountNeedsAuth) {
      toast.error(
        `O desconto informado (${discountPercent.toFixed(1)}%) é maior que o limite de ${maxDiscountPercent}% permitido sem autorização, definido em Configurações.\n\nPeça a um administrador para autorizar (ícone de escudo ao lado do campo de desconto).`,
        "Desconto Acima do Limite"
      );
      return;
    }

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

    const maxCapacidadeTotal = selectedTariff.pax + children;
    const totalOccupants = 1 + secondaryGuests.length;

    if (adults > selectedTariff.pax) {
      toast.error(
        `A quantidade de adultos (${adults}) excede a capacidade da tarifa '${selectedTariff.name}' (${selectedTariff.pax} adulto(s)).`,
        "Capacidade de Adultos Excedida"
      );
      return;
    }

    if (totalOccupants > maxCapacidadeTotal) {
      toast.error(
        `Check-in Bloqueado por Incoerência de Ocupação:\n\nA capacidade total desta hospedagem é de ${maxCapacidadeTotal} pessoa(s) (${selectedTariff.pax} Adulto(s) + ${children} Criança(s)), mas foram registrados ${totalOccupants} hóspede(s) (1 Principal + ${secondaryGuests.length} Acompanhante(s)).\n\nAjuste o número de crianças ou selecione uma tarifa compatível antes de continuar.`,
        "Capacidade Excedida"
      );
      return;
    }

    // Mapeia a descrição da forma de pagamento exibida na grade local para o código aceito
    // pelo backend — só agora, no momento de efetivar o check-in, esses valores seguem para o banco.
    const paymentMethodApiCodes: Record<string, string> = {
      "Dinheiro": "DINHEIRO",
      "PIX Instantâneo": "PIX",
      "Cartão Crédito": "CARTAO_CREDITO",
      "Cartão Débito": "CARTAO_DEBITO",
      "Faturado Corporativo": "FATURADO_CORPORATIVO",
    };

    const payload = {
      roomId: roomData.number,
      documentType: docType,
      documentNumber: docNumber,
      guestName: guestName.toUpperCase(),
      phone,
      // Ficha completa consultada no Hub do Desenvolvedor (ou já vinda do cadastro local) — antes
      // esses dados eram exibidos na tela mas descartados ao confirmar; agora seguem para o
      // cadastro do hóspede junto com o check-in.
      birthDate,
      gender,
      motherName,
      fatherName,
      fullAddress,
      email,
      tariffId: selectedTariff.id,
      tariffName: selectedTariff.name,
      dailyRate,
      checkInDate: dtChegada,
      checkOutDate: dtSaida,
      adults,
      children,
      nights,
      secondaryGuests,
      initialPayments: paymentsList.map((p) => ({
        valor: p.amount,
        formaPagamento: paymentMethodApiCodes[p.methodDescription] || "DINHEIRO",
        descricao: `Pagamento no Check-in — Quarto ${roomData.number}`,
      })),
      observations: obsList,
      totalBruto: totalDiariasBruto,
      discount,
      totalAdvance: totalAdiantamento,
      balance: saldoAPagar,
      operatorId: activeOperatorId,
      operatorName: activeOperatorName,
    };

    setIsSaving(true);
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
                Hospedagem
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
                  value={dtChegada.slice(0, 16)}
                  className={`w-full rounded-md px-2 py-1 font-mono text-[11px] ${isDark ? "bg-slate-950/80 border border-slate-800 text-emerald-400" : "bg-emerald-50 border border-emerald-300 text-emerald-700 font-bold"}`}
                />
              </div>

              <div>
                <label className={`text-[10px] block mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600 font-semibold"}`}>Dt.Saida</label>
                <input
                  type="text"
                  readOnly
                  value={dtSaida.slice(0, 16)}
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
                    <span className={`font-mono font-bold text-xs ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>R$ {dailyRate.toFixed(2).replace(".", ",")}</span>
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
                            setAdults(Math.min(adults, t.pax));
                            setShowTariffDropdown(false);

                            // Ajustar lista de acompanhantes se exceder a nova capacidade (pax + crianças)
                            const maxTotalAllowed = t.pax + children;
                            const maxSecondaryAllowed = Math.max(0, maxTotalAllowed - 1);
                            if (secondaryGuests.length > maxSecondaryAllowed) {
                              setSecondaryGuests((prev) => prev.slice(0, maxSecondaryAllowed));
                              toast.info(
                                `A tarifa '${t.name}' acomoda até ${t.pax} adulto(s) (total ${maxTotalAllowed} pax com crianças). A lista de acompanhantes foi ajustada.`,
                                "Ajuste de Acompanhantes"
                              );
                            }
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
                    onChange={() => setDocType("CPF")}
                    className="accent-[#0284C7]"
                  />
                  <span>CPF</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer font-bold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === "CNPJ"}
                    onChange={() => setDocType("CNPJ")}
                    className="accent-[#0284C7]"
                  />
                  <span>CNPJ</span>
                </label>

                <label className={`flex items-center gap-1.5 cursor-pointer font-bold text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="radio"
                    name="docType"
                    checked={docType === "PASSAPORTE"}
                    onChange={() => setDocType("PASSAPORTE")}
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
                      // Editar o documento manualmente invalida a verificação prévia (Hub/pesquisa/cadastro manual):
                      // impede que o operador troque para outra pessoa sem nova verificação.
                      setHubGuestSaved(false);
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
                    onChange={(e) => {
                      setGuestName(e.target.value.toUpperCase());
                      // Editar o nome manualmente invalida a verificação prévia (Hub/pesquisa/cadastro manual):
                      // impede que o operador troque para outra pessoa sem nova verificação.
                      setHubGuestSaved(false);
                    }}
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
                    <div className="col-span-4 relative">
                      <div className="flex items-center justify-between mb-0.5">
                        <label className={`text-[10px] font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                          Período da Hospedagem
                        </label>
                        <span className="text-[9px] opacity-75 font-normal">(chegada: hoje, {defaultCheckInTime}h ou horário real se após o limite · saída: {defaultCheckOutTime}h)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Dt.Chegada — sempre a data de hoje, nunca editável (check-in é sempre "agora") */}
                        <div>
                          <span className={`block text-[9px] font-semibold mb-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Dt.Chegada</span>
                          <div
                            title="O check-in é sempre efetivado na data de hoje."
                            className={`w-full flex items-center justify-between gap-1 border rounded-md p-1.5 font-mono font-bold text-xs cursor-not-allowed ${
                              isDark ? "bg-slate-950 border-slate-700 text-emerald-400" : "bg-emerald-50 border-emerald-300 text-emerald-700"
                            }`}
                          >
                            <span>{dtChegada.slice(0, 16)}</span>
                            <Lock className="w-3 h-3 shrink-0 opacity-70" />
                          </div>
                        </div>

                        {/* Dt.Saida — apenas informativo, a escolha é feita pelo calendário */}
                        <div>
                          <span className={`block text-[9px] font-semibold mb-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Dt.Saida</span>
                          <button
                            type="button"
                            onClick={() => setShowDateRangePicker((v) => !v)}
                            className={`w-full flex items-center justify-between gap-1 border rounded-md p-1.5 font-mono font-bold text-xs ${
                              isDark ? "bg-slate-950 border-slate-700 text-amber-400 hover:border-amber-400" : "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500"
                            }`}
                          >
                            <span>{dtSaida.slice(0, 16)}</span>
                            <Calendar className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          </button>
                        </div>
                      </div>

                      <DateRangeCalendarPicker
                        isOpen={showDateRangePicker}
                        onClose={() => setShowDateRangePicker(false)}
                        checkInLocal={dtChegadaLocal}
                        checkOutLocal={dtSaidaLocal}
                        minDateYMD={todayDateStr()}
                        lockStart
                        onSelectStart={() => {}}
                        onSelectEnd={(dateYMD) => handleDtSaidaChange(`${dateYMD}T${defaultCheckOutTime}`)}
                        isDark={isDark}
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
                            toast.warning(`A tarifa '${selectedTariff.name}' suporta no máximo ${selectedTariff.pax} adulto(s). Para acomodar ${val} adultos, por favor selecione uma tarifa com maior capacidade.`);
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

                  {/* Chegada de madrugada: exige decisão do operador sobre a noite anterior */}
                  {isMadrugadaCheckin && (
                    <div className={`rounded-lg border p-2.5 space-y-2 ${
                      earlyArrivalPending
                        ? (isDark ? "bg-red-500/10 border-red-500/40" : "bg-red-50 border-red-300")
                        : (isDark ? "bg-slate-900/60 border-slate-700" : "bg-slate-50 border-slate-200")
                    }`}>
                      <div className="flex items-start gap-2">
                        <Moon className={`w-4 h-4 shrink-0 mt-0.5 ${earlyArrivalPending ? "text-red-400" : "text-sky-400"}`} />
                        <div className="flex-1">
                          <p className={`text-[11px] font-bold ${earlyArrivalPending ? (isDark ? "text-red-300" : "text-red-700") : (isDark ? "text-slate-200" : "text-slate-800")}`}>
                            Chegada de madrugada ({dtChegada.slice(11, 16)}) — muito antes do horário padrão de check-in ({defaultCheckInTime}h)
                          </p>
                          <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            Como tratar a noite anterior à diária oficial?
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEarlyArrivalChoice("EXTRA_NIGHT")}
                          className={`px-2 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${
                            earlyArrivalChoice === "EXTRA_NIGHT"
                              ? "bg-sky-600 border-sky-500 text-white"
                              : (isDark ? "bg-slate-950 border-slate-700 text-slate-300 hover:border-sky-500" : "bg-white border-slate-300 text-slate-700 hover:border-sky-500")
                          }`}
                        >
                          Diária Extra<br /><span className="font-mono opacity-80">R$ {dailyRate.toFixed(2).replace(".", ",")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEarlyArrivalChoice("HALF_NIGHT")}
                          className={`px-2 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${
                            earlyArrivalChoice === "HALF_NIGHT"
                              ? "bg-sky-600 border-sky-500 text-white"
                              : (isDark ? "bg-slate-950 border-slate-700 text-slate-300 hover:border-sky-500" : "bg-white border-slate-300 text-slate-700 hover:border-sky-500")
                          }`}
                        >
                          Meia Diária<br /><span className="font-mono opacity-80">R$ {(dailyRate / 2).toFixed(2).replace(".", ",")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEarlyArrivalChoice("FIXED_FEE")}
                          className={`px-2 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${
                            earlyArrivalChoice === "FIXED_FEE"
                              ? "bg-sky-600 border-sky-500 text-white"
                              : (isDark ? "bg-slate-950 border-slate-700 text-slate-300 hover:border-sky-500" : "bg-white border-slate-300 text-slate-700 hover:border-sky-500")
                          }`}
                        >
                          Taxa Fixa
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (earlyArrivalCourtesyAuthorized) {
                              setEarlyArrivalChoice("COURTESY");
                            } else {
                              setAdminAuthPurpose("COURTESY");
                              setShowAdminAuthModal(true);
                            }
                          }}
                          className={`px-2 py-1.5 rounded-md text-[10px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                            earlyArrivalChoice === "COURTESY"
                              ? "bg-emerald-600 border-emerald-500 text-white"
                              : (isDark ? "bg-slate-950 border-slate-700 text-slate-300 hover:border-emerald-500" : "bg-white border-slate-300 text-slate-700 hover:border-emerald-500")
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3 opacity-80" /> Cortesia
                        </button>
                      </div>

                      {earlyArrivalChoice === "FIXED_FEE" && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>Valor da taxa (R$):</span>
                            <input
                              type="text"
                              value={earlyArrivalFixedFeeInput}
                              onChange={(e) => {
                                setEarlyArrivalFixedFeeInput(e.target.value);
                                setEarlyArrivalFixedFeeAuthorized(false);
                              }}
                              className={`w-24 border rounded-md px-2 py-1 text-right font-mono font-bold text-xs ${
                                earlyArrivalFixedFeeBelowHalf
                                  ? (isDark ? "bg-slate-950 border-amber-500 text-amber-300" : "bg-amber-50 border-amber-400 text-amber-800")
                                  : (isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900")
                              }`}
                            />
                            <span className={`text-[9px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                              (mínimo sem autorização: R$ {(dailyRate / 2).toFixed(2).replace(".", ",")})
                            </span>
                          </div>

                          {earlyArrivalFixedFeeBelowHalf && (
                            <div className={`flex items-center gap-2 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {earlyArrivalFixedFeeAuthorized ? (
                                <span className="flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3" /> Autorizado por {earlyArrivalAuthorizedBy}
                                </span>
                              ) : (
                                <>
                                  <span>Valor abaixo da meia diária exige senha de administrador.</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAdminAuthPurpose("LOW_FIXED_FEE");
                                      setShowAdminAuthModal(true);
                                    }}
                                    className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0"
                                  >
                                    Autorizar
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {earlyArrivalChoice === "COURTESY" && earlyArrivalAuthorizedBy && (
                        <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                          <ShieldCheck className="w-3 h-3" /> Cortesia autorizada por {earlyArrivalAuthorizedBy}
                        </div>
                      )}

                      {earlyArrivalPending && (
                        <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${isDark ? "text-red-300" : "text-red-700"}`}>
                          <AlertTriangle className="w-3 h-3" /> Selecione uma opção para liberar a hospedagem
                        </div>
                      )}
                    </div>
                  )}

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
                      <span className="text-[9px] text-slate-400 italic">Gravado ao confirmar o check-in</span>
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
                          className={`w-full p-1 rounded font-bold text-white flex items-center justify-center disabled:opacity-60 ${
                            isDark ? "bg-[#00b4d8] hover:bg-[#0077b6]" : "bg-[#0284C7] hover:bg-[#0369A1]"
                          }`}
                          title="Adicionar Pagamento/Adiantamento à grade (gravado ao confirmar o check-in)"
                        >
                          <Plus className="w-3.5 h-3.5" />
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
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-[11px] block ${isDark ? "text-[#00b4d8]" : "text-[#0284C7]"}`}>Demais Hospede:</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      1 + secondaryGuests.length >= selectedTariff.pax + children ? "text-amber-500" : isDark ? "text-slate-400" : "text-slate-600"
                    }`}>
                      {1 + secondaryGuests.length} / {selectedTariff.pax + children} pax
                    </span>
                  </div>

                  {1 + secondaryGuests.length >= selectedTariff.pax + children && (
                    <div className="p-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-medium flex items-center gap-1">
                      <Info className="w-3 h-3 shrink-0" />
                      Limite da hospedagem atingido ({selectedTariff.pax + children} pax = {selectedTariff.pax} Ad. + {children} Cri.).
                    </div>
                  )}

                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newGuestInput}
                      onChange={(e) => setNewGuestInput(e.target.value)}
                      disabled={1 + secondaryGuests.length >= selectedTariff.pax + children}
                      placeholder={
                        1 + secondaryGuests.length >= selectedTariff.pax + children
                          ? "Limite da hospedagem atingido..."
                          : "Nome do acompanhante..."
                      }
                      className={`w-full border rounded-lg p-1.5 text-xs outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDark ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-[#00b4d8]" : "bg-white border-slate-300 text-slate-900 focus:border-[#0284C7]"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddSecondaryGuest}
                      disabled={1 + secondaryGuests.length >= selectedTariff.pax + children}
                      className={`px-2.5 py-1.5 rounded-lg text-white font-bold flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${
                        isDark ? "bg-[#00b4d8] hover:bg-[#0077b6]" : "bg-[#0284C7] hover:bg-[#0369A1]"
                      }`}
                      title={1 + secondaryGuests.length >= selectedTariff.pax + children ? `Limite da hospedagem (${selectedTariff.pax + children} pax) atingido.` : "Adicionar Acompanhante"}
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
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className={`w-24 border rounded px-2 py-0.5 text-rose-500 font-mono font-bold text-xs ${
                      discountNeedsAuth
                        ? "border-red-500"
                        : (isDark ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300")
                    }`}
                  />
                  {discountNeedsAuth && (
                    <button
                      type="button"
                      title={`Desconto de ${discountPercent.toFixed(1)}% acima do limite de ${maxDiscountPercent}% — exige autorização`}
                      onClick={() => { setAdminAuthPurpose("HIGH_DISCOUNT"); setShowAdminAuthModal(true); }}
                      className="p-1 rounded bg-red-500/15 border border-red-500/40 text-red-500 hover:bg-red-500/25 transition-colors"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {discountAuthorized && discountAuthorizedBy && (
                  <span className={`text-[9px] flex items-center gap-1 mt-0.5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                    <ShieldCheck className="w-2.5 h-2.5" /> Autorizado por {discountAuthorizedBy}
                  </span>
                )}
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
                disabled={isSaving}
                className={`px-6 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isDark ? "bg-[#00b4d8] hover:bg-[#0077b6] shadow-cyan-500/20" : "bg-[#0284C7] hover:bg-[#0369A1] shadow-sky-500/20"
                }`}
              >
                <Save className="w-4 h-4" /> {isSaving ? "Salvando..." : "Efetuar Hospedagem"}
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

        {/* ===== AUTORIZAÇÃO ADMIN: CORTESIA, TAXA FIXA ABAIXO DA META DIÁRIA OU DESCONTO ACIMA DO LIMITE ===== */}
        <AdminAuthorizationModal
          isOpen={showAdminAuthModal}
          onClose={() => { setShowAdminAuthModal(false); setAdminAuthPurpose(null); }}
          reason={
            adminAuthPurpose === "LOW_FIXED_FEE"
              ? "aplicar uma taxa de chegada antecipada abaixo da meia diária"
              : adminAuthPurpose === "HIGH_DISCOUNT"
              ? `aplicar um desconto de ${discountPercent.toFixed(1)}%, acima do limite de ${maxDiscountPercent}% sem autorização`
              : "conceder cortesia (isenção de cobrança) na noite anterior a uma chegada de madrugada"
          }
          onAuthorized={(admin) => {
            if (adminAuthPurpose === "LOW_FIXED_FEE") {
              setEarlyArrivalAuthorizedBy(admin.name);
              setEarlyArrivalFixedFeeAuthorized(true);
              toast.success(`Taxa reduzida autorizada por ${admin.name}.`);
            } else if (adminAuthPurpose === "HIGH_DISCOUNT") {
              setDiscountAuthorized(true);
              setDiscountAuthorizedBy(admin.name);
              toast.success(`Desconto de ${discountPercent.toFixed(1)}% autorizado por ${admin.name}.`);
            } else {
              setEarlyArrivalAuthorizedBy(admin.name);
              setEarlyArrivalCourtesyAuthorized(true);
              setEarlyArrivalChoice("COURTESY");
              toast.success(`Cortesia autorizada por ${admin.name}.`);
            }
            setShowAdminAuthModal(false);
            setAdminAuthPurpose(null);
          }}
        />
      </div>
    );
  }
