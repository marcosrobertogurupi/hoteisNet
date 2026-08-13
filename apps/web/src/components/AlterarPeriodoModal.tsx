"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Calendar,
  Clock,
  User,
  Plus,
  Trash2,
  AlertTriangle,
  Lock,
  Save,
  ChevronLeft,
  ChevronRight,
  Filter
} from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";

export interface TariffOption {
  id: string;
  name: string;
  ratePerNight: number;
  description: string;
  adults?: number;
}

export const TARIFF_OPTIONS: TariffOption[] = [
  { id: "APTO_TRIPLO", name: "APTO ESPECIAL TRIPLO", ratePerNight: 170, description: "1 CAMA DE CASAL + 1 SOLTEIRO", adults: 3 },
  { id: "SUITE_LUXO", name: "SUÍTE LUXO MAR", ratePerNight: 350, description: "1 CAMA KING + SACADA COM VISTA PRO MAR", adults: 2 },
  { id: "STANDARD_SUP", name: "STANDARD SUPERIOR", ratePerNight: 280, description: "1 CAMA DE CASAL + AR CONDICIONADO SPLIT", adults: 2 },
  { id: "MASTER_FAMILIA", name: "MASTER FAMÍLIA", ratePerNight: 450, description: "2 CAMAS DE CASAL + 2 CAMAS SOLTEIRO", adults: 4 },
  { id: "TARIFA_BALCAO", name: "TARIFA BALCÃO REGULAR", ratePerNight: 200, description: "ACOMODAÇÃO PADRÃO HOTEL", adults: 1 },
];

export interface PaymentItem {
  id: string;
  date: string;
  amount: number;
  paymentMethod: string;
}

export interface ExistingReservation {
  id: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;  // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
}

// Sample active reservations to check conflicts against
const MOCK_EXISTING_RESERVATIONS: ExistingReservation[] = [
  {
    id: "RES-4092",
    guestName: "Juliana Andrade",
    roomNumber: "312",
    checkInDate: "2026-02-10",
    checkOutDate: "2026-02-15",
  },
  {
    id: "RES-4093",
    guestName: "Roberto Almeida",
    roomNumber: "102",
    checkInDate: "2026-08-16",
    checkOutDate: "2026-08-20",
  },
  {
    id: "RES-4094",
    guestName: "Empresa Vale S.A.",
    roomNumber: "203",
    checkInDate: "2026-08-18",
    checkOutDate: "2026-08-22",
  },
  {
    id: "RES-4095",
    guestName: "Clara Ferreira Lima",
    roomNumber: "105",
    checkInDate: "2026-08-18",
    checkOutDate: "2026-08-21",
  }
];

interface AlterarPeriodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayData: {
    idHospedagem: string;
    roomNumber: string;
    roomCategory?: string;
    guestName: string;
    cpf: string;
    checkInDate: string;  // e.g. "06/02/2026 16:24:42" or "2026-02-06T16:24:42"
    checkOutDate: string; // e.g. "07/02/2026 14:00:00" or "2026-02-07T14:00:00"
    ratePerNight?: number;
    tariffName?: string;
    roomDescription?: string;
    totalConsumption?: number;
    payments?: PaymentItem[];
    existingReservations?: ExistingReservation[];
  };
  onSave: (updatedData: {
    checkOutDate: string;
    tariffName: string;
    ratePerNight: number;
    totalNights: number;
    totalBruto: number;
    saldoAPagar: number;
    payments: PaymentItem[];
    adults: number;
    children: number;
  }) => void;
}

export default function AlterarPeriodoModal({
  isOpen,
  onClose,
  stayData,
  onSave,
}: AlterarPeriodoModalProps) {
  // Parsing date utilities
  const parseDateTime = (dtStr: string): Date => {
    if (!dtStr) return new Date();
    if (dtStr.includes("/")) {
      const [datePart, timePart] = dtStr.split(" ");
      const [day, month, year] = datePart.split("/").map(Number);
      const [hour, min, sec] = (timePart || "14:00:00").split(":").map(Number);
      return new Date(year, month - 1, day, hour || 14, min || 0, sec || 0);
    }
    return new Date(dtStr);
  };

  const formatDateToInputValue = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateTimeDisplay = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
  };

  // Form State
  const initialCheckin = useMemo(() => parseDateTime(stayData.checkInDate), [stayData.checkInDate]);
  const initialCheckout = useMemo(() => parseDateTime(stayData.checkOutDate), [stayData.checkOutDate]);

  const [checkOutDate, setCheckOutDate] = useState<Date>(initialCheckout);
  const [checkOutTimeString, setCheckOutTimeString] = useState<string>(
    `${String(initialCheckout.getHours()).padStart(2, "0")}:${String(initialCheckout.getMinutes()).padStart(2, "0")}:00`
  );

  const [selectedTariffId, setSelectedTariffId] = useState<string>(() => {
    const found = TARIFF_OPTIONS.find(t => t.name === stayData.tariffName || t.ratePerNight === stayData.ratePerNight);
    return found ? found.id : "APTO_TRIPLO";
  });

  const currentTariff = useMemo(() => {
    return TARIFF_OPTIONS.find(t => t.id === selectedTariffId) || TARIFF_OPTIONS[0];
  }, [selectedTariffId]);

  const [adults, setAdults] = useState<number>(1);
  const [children, setChildren] = useState<number>(0);
  const [guestList, setGuestList] = useState<string[]>([]);
  const [newGuestInput, setNewGuestInput] = useState<string>("");

  // Payments State
  const [payments, setPayments] = useState<PaymentItem[]>(stayData.payments || []);
  const [paymentDateInput, setPaymentDateInput] = useState<string>(formatDateToInputValue(new Date()));
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>("");
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>("Dinheiro");

  // Financial Discount
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const totalConsumption = stayData.totalConsumption || 0;

  // Calendar Navigation State
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(initialCheckin);

  // Lock Check-in Start Date Warning state
  const [showCheckinLockAlert, setShowCheckinLockAlert] = useState(false);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      const cin = parseDateTime(stayData.checkInDate);
      const cout = parseDateTime(stayData.checkOutDate);
      setCheckOutDate(cout);
      setCheckOutTimeString(`${String(cout.getHours()).padStart(2, "0")}:${String(cout.getMinutes()).padStart(2, "0")}:00`);
      setCalendarViewDate(cin);
    }
  }, [isOpen, stayData]);

  // Calculation of Nights
  const calculatedNights = useMemo(() => {
    const cinTime = new Date(initialCheckin.getFullYear(), initialCheckin.getMonth(), initialCheckin.getDate()).getTime();
    const coutTime = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate()).getTime();
    const diffMs = coutTime - cinTime;
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(1, days);
  }, [initialCheckin, checkOutDate]);

  // Financial Totals
  const valorTotalBruto = useMemo(() => {
    return calculatedNights * currentTariff.ratePerNight;
  }, [calculatedNights, currentTariff.ratePerNight]);

  const totalAdiantamento = useMemo(() => {
    return payments.reduce((acc, p) => acc + p.amount, 0);
  }, [payments]);

  const saldoAPagar = useMemo(() => {
    const totalAccrued = valorTotalBruto + totalConsumption;
    const finalBalance = totalAccrued - totalAdiantamento - discountAmount;
    return Math.max(0, finalBalance);
  }, [valorTotalBruto, totalConsumption, totalAdiantamento, discountAmount]);

  // Reservation Conflict Detection Rule:
  // "ao alterar o check-out tenho que respeitar se tem reserva feita no periodo"
  const reservationConflict = useMemo(() => {
    const allReservations = [
      ...MOCK_EXISTING_RESERVATIONS,
      ...(stayData.existingReservations || [])
    ];

    const currentRoomNo = stayData.roomNumber;
    const cinYMD = formatDateToInputValue(initialCheckin);
    const coutYMD = formatDateToInputValue(checkOutDate);

    for (const res of allReservations) {
      if (res.roomNumber === currentRoomNo) {
        if (res.checkInDate < coutYMD && res.checkOutDate > cinYMD) {
          if (res.id !== stayData.idHospedagem) {
            return res;
          }
        }
      }
    }
    return null;
  }, [stayData.roomNumber, stayData.idHospedagem, initialCheckin, checkOutDate, stayData.existingReservations]);

  if (!isOpen) return null;

  // Handlers
  const handleAddPayment = () => {
    const val = parseFloat(paymentAmountInput);
    if (isNaN(val) || val <= 0) return;

    const newPayment: PaymentItem = {
      id: `PAG-${Date.now()}`,
      date: paymentDateInput.split("-").reverse().join("/"),
      amount: val,
      paymentMethod: paymentMethodInput,
    };
    setPayments([...payments, newPayment]);
    setPaymentAmountInput("");
  };

  const handleRemovePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const handleAddGuest = () => {
    if (!newGuestInput.trim()) return;
    setGuestList([...guestList, newGuestInput.trim().toUpperCase()]);
    setNewGuestInput("");
  };

  const handleSave = () => {
    if (reservationConflict) {
      alert(`CONFLITO DE RESERVA DETECTADO!\n\nNão é possível salvar a alteração. O quarto ${stayData.roomNumber} possui uma reserva confirmada (${reservationConflict.id} - ${reservationConflict.guestName}) do dia ${reservationConflict.checkInDate} até ${reservationConflict.checkOutDate}.`);
      return;
    }

    const [h, m, s] = checkOutTimeString.split(":");
    const finalCout = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate(), parseInt(h || "14"), parseInt(m || "0"), parseInt(s || "0"));

    onSave({
      checkOutDate: formatDateTimeDisplay(finalCout),
      tariffName: currentTariff.name,
      ratePerNight: currentTariff.ratePerNight,
      totalNights: calculatedNights,
      totalBruto: valorTotalBruto,
      saldoAPagar,
      payments,
      adults,
      children,
    });
    onClose();
  };

  // Calendar Day Rendering Logic
  const getCalendarDays = () => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonthDays = new Date(year, month, 0).getDate();
    const days = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true });
    }

    const remaining = 35 - days.length;
    for (let j = 1; j <= (remaining > 0 ? remaining : 0); j++) {
      days.push({ day: j, isCurrentMonth: false });
    }

    return days;
  };

  // Occupied Dates Detection for current room
  const occupiedDates = useMemo(() => {
    const allReservations = [
      ...MOCK_EXISTING_RESERVATIONS,
      ...(stayData.existingReservations || [])
    ];
    const currentRoomNo = stayData.roomNumber;
    const dateSet = new Set<string>();

    for (const res of allReservations) {
      if (res.roomNumber === currentRoomNo && res.id !== stayData.idHospedagem) {
        const startStr = (res.checkInDate || "").split("T")[0];
        const endStr = (res.checkOutDate || "").split("T")[0];
        if (startStr && endStr) {
          const start = new Date(startStr + "T00:00:00");
          const end = new Date(endStr + "T00:00:00");
          const cur = new Date(start);
          while (cur < end) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, "0");
            const d = String(cur.getDate()).padStart(2, "0");
            dateSet.add(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 1);
          }
        }
      }
    }
    return Array.from(dateSet);
  }, [stayData.roomNumber, stayData.idHospedagem, stayData.existingReservations]);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const handleSelectCalendarDay = (day: number) => {
    const newDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), day);
    const dateYMD = formatDateToInputValue(newDate);

    if (occupiedDates.includes(dateYMD)) {
      alert("Atenção: Esta data está ocupada por outra reserva para este quarto!");
      return;
    }

    if (newDate < new Date(initialCheckin.getFullYear(), initialCheckin.getMonth(), initialCheckin.getDate())) {
      alert("A data de check-out não pode ser anterior à data de chegada!");
      return;
    }
    setCheckOutDate(newDate);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Main Container styled exactly like WinDev Screenshot */}
      <div className="relative w-full max-w-5xl bg-[#EBECE8] text-slate-900 rounded-lg shadow-2xl overflow-hidden border-2 border-slate-400 font-sans">
        
        {/* WINDEV WINDOW HEADER BAR */}
        <div className="bg-slate-200 border-b border-slate-300 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-700" />
            <h2 className="text-base font-bold text-slate-800">
              Alterar Periodo Hospedagem: {stayData.idHospedagem || "2627"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-red-600 hover:bg-slate-300 rounded p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Subtitle */}
          <div className="border-b border-slate-300 pb-1">
            <h3 className="text-sm font-bold text-slate-800">Alterar Periodo Hospedagem</h3>
          </div>

          {/* MAIN GRID: LEFT FORM & RIGHT CALENDAR */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* LEFT SIDE FORM (Cols 1-8) */}
            <div className="lg:col-span-8 space-y-3">
              
              {/* ROW 1: TARIFAS & VALOR DIÁRIA */}
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-8">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Tarifas</label>
                  <select
                    value={selectedTariffId}
                    onChange={(e) => setSelectedTariffId(e.target.value)}
                    className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-inner"
                  >
                    {TARIFF_OPTIONS.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} • {t.adults || 1} {(t.adults || 1) === 1 ? "Adulto" : "Adultos"} • R$ {t.ratePerNight.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4 text-right">
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Valor diaria (R$)</label>
                  <div className="bg-[#FFFDE7] border border-slate-300 rounded px-3 py-1.5 text-right font-bold text-slate-800 text-sm shadow-inner">
                    R$ {currentTariff.ratePerNight.toFixed(2).replace(".", ",")}
                  </div>
                </div>
              </div>

              {/* ROW 2: QUARTO, DESCRIÇÃO QUARTO, DT. CHEGADA & DT. SAÍDA */}
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Quartos</label>
                  <input
                    type="text"
                    readOnly
                    value={stayData.roomNumber}
                    className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-1 font-bold text-slate-800 text-center shadow-inner"
                  />
                </div>
                <div className="col-span-4">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Descrição quarto</label>
                  <input
                    type="text"
                    readOnly
                    value={currentTariff.description || stayData.roomDescription || "1 CAMA DE CASAL + 1 SOLTEIRO"}
                    className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-1 text-slate-700 font-medium truncate shadow-inner"
                  />
                </div>

                {/* DT. CHEGADA - STRICTLY READONLY / LOCKED RULE */}
                <div className="col-span-3 relative">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5 flex items-center gap-1">
                      Dt.Chegada <span title="Início de check-in bloqueado para alteração"><Lock className="w-3 h-3 text-red-600" /></span>
                    </label>
                  </div>
                  <div
                    onClick={() => setShowCheckinLockAlert(true)}
                    className="cursor-not-allowed bg-slate-200 border border-slate-400 rounded px-1.5 py-1 font-mono font-semibold text-slate-600 text-[11px] flex items-center justify-between"
                  >
                    <span>{formatDateTimeDisplay(initialCheckin)}</span>
                  </div>
                  {showCheckinLockAlert && (
                    <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-amber-100 border border-amber-400 text-amber-900 p-2 rounded text-[10px] shadow-lg flex items-start gap-1">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Regra de Sistema:</strong> A data de início do check-in não pode ser alterada. Apenas a data de saída (check-out) pode ser ajustada.
                        <button onClick={() => setShowCheckinLockAlert(false)} className="block text-sky-700 font-bold underline mt-1">Entendido</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* DT. SAÍDA - EDITABLE RULE */}
                <div className="col-span-3">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Dt.Saida</label>
                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <CustomDatePicker
                        value={formatDateToInputValue(checkOutDate)}
                        onChange={(v) => {
                          if (!v) return;
                          const [y, m, d] = v.split("-").map(Number);
                          const newDate = new Date(y, m - 1, d);
                          if (newDate < new Date(initialCheckin.getFullYear(), initialCheckin.getMonth(), initialCheckin.getDate())) {
                            alert("A data de saída não pode ser menor que a data de chegada!");
                            return;
                          }
                          setCheckOutDate(newDate);
                        }}
                        occupiedDates={occupiedDates}
                        minDate={formatDateToInputValue(initialCheckin)}
                        isDark={false}
                        type="date"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCalendarViewDate(checkOutDate)}
                      className="p-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded shadow transition-colors shrink-0"
                      title="Sincronizar Calendário"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* RESERVATION CONFLICT ALERT BANNER */}
              {reservationConflict && (
                <div className="bg-red-100 border-2 border-red-500 rounded p-2.5 flex items-start gap-2 text-red-900 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block text-red-800">⚠️ IMPEDIMENTO DE CHECK-OUT (RESERVA NO PERÍODO):</span>
                    Já existe a reserva <strong className="underline">{reservationConflict.id}</strong> feita para <strong>{reservationConflict.guestName}</strong> no quarto <strong>{stayData.roomNumber}</strong> entre os dias <strong>{reservationConflict.checkInDate}</strong> e <strong>{reservationConflict.checkOutDate}</strong>.
                    Não é possível prorrogar o check-out além dessa data.
                  </div>
                </div>
              )}

              {/* ROW 3: CPF & NOME HÓSPEDE PRINCIPAL & STEPPERS */}
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">C.P.F.</label>
                  <input
                    type="text"
                    readOnly
                    value={stayData.cpf || "64320430182"}
                    className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-1 font-mono text-slate-800 shadow-inner"
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5">Nome do Hospede Principal</label>
                  <div className="flex items-center gap-1">
                    <div className="p-1 bg-slate-300 rounded border border-slate-400 text-slate-700">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={stayData.guestName}
                      className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-1 font-bold text-slate-800 uppercase truncate shadow-inner"
                    />
                  </div>
                </div>

                {/* ADULTO, CRIANÇA, DIÁRIAS */}
                <div className="col-span-4 flex items-center justify-end gap-2">
                  <div className="text-center">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Adulto</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={adults}
                      onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                      className="w-12 bg-[#FFFDE7] border border-slate-400 rounded py-0.5 text-center font-bold text-slate-900 shadow-inner"
                    />
                  </div>
                  <div className="text-center">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Criança</label>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={children}
                      onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                      className="w-12 bg-[#FFFDE7] border border-slate-400 rounded py-0.5 text-center font-bold text-slate-900 shadow-inner"
                    />
                  </div>
                  <div className="text-center">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Diárias</label>
                    <input
                      type="text"
                      readOnly
                      value={calculatedNights}
                      className="w-12 bg-[#FFFDE7] border border-slate-400 rounded py-0.5 text-center font-extrabold text-cyan-800 shadow-inner"
                    />
                  </div>
                </div>
              </div>

              {/* ROW 4: DEMAIS HÓSPEDES TABLE */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-700">Demais Hospede</span>
                  <div className="flex-1 flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Nome do acompanhante..."
                      value={newGuestInput}
                      onChange={(e) => setNewGuestInput(e.target.value)}
                      className="flex-1 bg-white border border-slate-400 rounded px-2 py-0.5 text-slate-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddGuest}
                      className="p-1 bg-slate-300 hover:bg-slate-400 border border-slate-500 rounded text-slate-800 font-bold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="border border-slate-400 rounded bg-white overflow-hidden shadow-inner min-h-[70px] max-h-[90px] overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-cyan-600 text-white font-bold sticky top-0">
                      <tr>
                        <th className="py-1 px-2 border-b border-cyan-700 flex items-center justify-between">
                          <span>Nome Hospede</span>
                          <Filter className="w-3 h-3 text-cyan-200 cursor-pointer" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {guestList.length === 0 ? (
                        <tr>
                          <td className="py-2 px-2 text-slate-400 italic text-[10px]">Nenhum acompanhante adicionado</td>
                        </tr>
                      ) : (
                        guestList.map((g, idx) => (
                          <tr key={idx} className="hover:bg-slate-100">
                            <td className="py-1 px-2 font-medium text-slate-800 flex items-center justify-between">
                              <span>{g}</span>
                              <button
                                onClick={() => setGuestList(guestList.filter((_, i) => i !== idx))}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ROW 5: ÁREA DE PAGAMENTOS */}
              <div className="space-y-1.5 pt-2 border-t border-slate-300">
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Dt. Pagto</label>
                    <input
                      type="date"
                      value={paymentDateInput}
                      onChange={(e) => setPaymentDateInput(e.target.value)}
                      className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-1.5 py-0.5 text-slate-800 text-[11px]"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Vlr. Pagto.</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={paymentAmountInput}
                      onChange={(e) => setPaymentAmountInput(e.target.value)}
                      className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-0.5 text-right font-bold text-slate-800 text-[11px]"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Forma de Pagamento</label>
                    <select
                      value={paymentMethodInput}
                      onChange={(e) => setPaymentMethodInput(e.target.value)}
                      className="w-full bg-[#FFFDE7] border border-slate-400 rounded px-2 py-0.5 text-slate-800 text-[11px]"
                    >
                      <option value="Dinheiro">Dinheiro Espécie</option>
                      <option value="PIX">PIX Transferência</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Faturado Enterprise">Faturado Empresa</option>
                    </select>
                  </div>
                  <div className="col-span-1 pt-4 text-center">
                    <button
                      type="button"
                      onClick={handleAddPayment}
                      className="p-1 bg-slate-300 hover:bg-slate-400 border border-slate-500 rounded text-slate-800 font-bold transition-colors"
                      title="Adicionar Pagamento"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* PAYMENTS TABLE */}
                <div className="border border-slate-400 rounded bg-white overflow-hidden shadow-inner min-h-[90px] max-h-[120px] overflow-y-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-cyan-600 text-white font-bold sticky top-0">
                      <tr>
                        <th className="py-1 px-2 border-b border-cyan-700 w-1/4">Data</th>
                        <th className="py-1 px-2 border-b border-cyan-700 w-1/3 text-right">Valor Pagto.</th>
                        <th className="py-1 px-2 border-b border-cyan-700">Descr.Form.Pagto</th>
                        <th className="py-1 px-1 border-b border-cyan-700 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 px-2 text-center text-slate-400 italic text-[10px]">
                            Nenhum pagamento registrado nesta hospedagem
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-1 px-2 font-mono text-slate-700">{p.date}</td>
                            <td className="py-1 px-2 text-right font-bold text-emerald-700">
                              R$ {p.amount.toFixed(2).replace(".", ",")}
                            </td>
                            <td className="py-1 px-2 text-slate-800">{p.paymentMethod}</td>
                            <td className="py-1 px-1 text-center">
                              <button
                                onClick={() => handleRemovePayment(p.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
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

            {/* RIGHT SIDE: CALENDAR WIDGET & FINANCIAL SUMMARY (Cols 9-12) */}
            <div className="lg:col-span-4 space-y-3 flex flex-col justify-between">
              
              {/* CALENDAR WIDGET */}
              <div className="bg-white border-2 border-slate-300 rounded p-2.5 shadow">
                {/* Month Navigator Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-slate-800 font-bold">
                  <button
                    onClick={() => {
                      const prev = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
                      setCalendarViewDate(prev);
                    }}
                    className="p-0.5 hover:bg-slate-200 rounded text-slate-600"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs">
                    {monthNames[calendarViewDate.getMonth()]} {calendarViewDate.getFullYear()}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
                      setCalendarViewDate(next);
                    }}
                    className="p-0.5 hover:bg-slate-200 rounded text-slate-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day Header Row */}
                <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] bg-cyan-600 text-white py-1 rounded-t">
                  <span>dom</span>
                  <span>seg</span>
                  <span>ter</span>
                  <span>qua</span>
                  <span>qui</span>
                  <span>sex</span>
                  <span>sáb</span>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] pt-1.5 font-semibold">
                  {getCalendarDays().map((cell, idx) => {
                    if (!cell.isCurrentMonth) {
                      return <span key={idx} className="text-slate-300 py-1">{cell.day}</span>;
                    }

                    const thisCellDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth(), cell.day);
                    const cinYMD = formatDateToInputValue(initialCheckin);
                    const coutYMD = formatDateToInputValue(checkOutDate);
                    const currentYMD = formatDateToInputValue(thisCellDate);

                    const isCheckinDay = currentYMD === cinYMD;
                    const isCheckoutDay = currentYMD === coutYMD;
                    const isInRange = currentYMD > cinYMD && currentYMD < coutYMD;

                    const isOccupied = occupiedDates.includes(currentYMD);

                    let bgStyle = "hover:bg-slate-200 text-slate-700 cursor-pointer rounded";
                    if (isOccupied) {
                      bgStyle = "bg-red-600 text-white font-black rounded shadow cursor-not-allowed border border-red-700 opacity-95";
                    } else if (isCheckinDay) {
                      bgStyle = "bg-slate-700 text-white font-bold rounded ring-2 ring-slate-800";
                    } else if (isCheckoutDay) {
                      bgStyle = "bg-emerald-500 text-white font-bold rounded shadow ring-2 ring-emerald-700";
                    } else if (isInRange) {
                      bgStyle = "bg-emerald-100 text-emerald-900 font-bold";
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => handleSelectCalendarDay(cell.day)}
                        title={isOccupied ? "Data Ocupada (Reserva Ativa no Quarto)" : currentYMD}
                        className={`py-1 transition-all ${bgStyle}`}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-200 mt-2">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-red-600 rounded-full inline-block"></span> Ocupado
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-slate-700 rounded-full inline-block"></span> Chegada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span> Saída
                  </span>
                </div>
              </div>

              {/* FINANCIAL SUMMARY BLOCK */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="block font-semibold text-slate-600">Valor total bruto (R$)</label>
                    <div className="bg-[#FFFDE7] border border-slate-300 rounded px-2 py-1 text-right font-bold text-slate-800 shadow-inner">
                      R$ {valorTotalBruto.toFixed(2).replace(".", ",")}
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600">Total Adiant. (R$)</label>
                    <div className="bg-[#FFFDE7] border border-slate-300 rounded px-2 py-1 text-right font-bold text-slate-800 shadow-inner">
                      R$ {totalAdiantamento.toFixed(2).replace(".", ",")}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="block font-semibold text-slate-600">Desconto (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={discountAmount || 0}
                      onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#FFFDE7] border border-slate-300 rounded px-2 py-1 text-right font-bold text-slate-800 shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-600">Total Consumo(R$)</label>
                    <div className="bg-[#FFFDE7] border border-slate-300 rounded px-2 py-1 text-right font-bold text-amber-800 shadow-inner">
                      R$ {totalConsumption.toFixed(2).replace(".", ",")}
                    </div>
                  </div>
                </div>

                {/* SALDO A PAGAR PROMINENT DISPLAY */}
                <div className="pt-1">
                  <div className="text-right">
                    <span className="text-base font-extrabold text-blue-800 block tracking-tight">
                      Saldo a pagar (R$)
                    </span>
                    <div className="bg-[#FFFDE7] border-2 border-slate-400 rounded-md p-2 text-right shadow-md">
                      <span className="text-2xl font-black text-red-600 tracking-tight">
                        R$ {saldoAPagar.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SAVE BUTTON */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!!reservationConflict}
                    className={`w-full py-2.5 px-4 rounded text-white font-bold flex items-center justify-center gap-2 shadow-lg transition-all text-sm ${
                      reservationConflict
                        ? "bg-slate-400 cursor-not-allowed"
                        : "bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98]"
                    }`}
                  >
                    <Save className="w-5 h-5" />
                    Salvar Alteração
                  </button>
                </div>

              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
