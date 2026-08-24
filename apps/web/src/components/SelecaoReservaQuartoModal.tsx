"use client";

import { useState } from "react";
import { 
  X, 
  Calendar, 
  BedDouble, 
  User, 
  Phone, 
  Plus, 
  Clock, 
  DollarSign, 
  Edit3, 
  CheckCircle2, 
  CreditCard,
  Building2,
  FileText,
  UserCheck,
  RefreshCw
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export interface ReservaItemQuarto {
  id: string;
  reservationNumber?: string;
  guestName: string;
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
  checkInDate: string;
  checkOutDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInDateRaw?: string;
  checkOutDateRaw?: string;
  status: string;
  totalAmount?: number;
  depositPaid?: number;
  dailyRate?: number;
  tariffName?: string;
  notes?: string;
  company?: string;
  adults?: number;
  children?: number;
  observations?: any[];
  payments?: any[];
  roomNumber?: string;
  precheckinSent?: boolean;
  fnrhCompleted?: boolean;
}

interface SelecaoReservaQuartoModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomNumber: string;
  roomCategory?: string;
  reservations: ReservaItemQuarto[];
  onSelectAlterarPeriodo: (reserva: ReservaItemQuarto) => void;
  onSelectAlterarTarifa: (reserva: ReservaItemQuarto) => void;
  onSelectLancarPagamento: (reserva: ReservaItemQuarto) => void;
  onEfetuarCheckin?: (reserva: ReservaItemQuarto) => void;
  onLancarNovaReservaQuarto: (roomNumber: string) => void;
  onSelectAlterarReserva?: (reserva: ReservaItemQuarto) => void;
  loading?: boolean;
}

export default function SelecaoReservaQuartoModal({
  isOpen,
  onClose,
  roomNumber,
  roomCategory = "Acomodação",
  reservations,
  onSelectAlterarPeriodo,
  onSelectAlterarTarifa,
  onSelectLancarPagamento,
  onEfetuarCheckin,
  onLancarNovaReservaQuarto,
  onSelectAlterarReserva,
  loading = false,
}: SelecaoReservaQuartoModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  if (!isOpen) return null;

  const roomReservations = reservations.filter(
    (r) => r.id.includes(roomNumber) || true // Show passed reservations for this room
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Header Modal */}
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-sky-500/10 border-sky-500/20 text-sky-400" : "bg-sky-50 border-sky-200 text-sky-600"
            }`}>
              <BedDouble className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-[#0284C7] text-white font-mono font-bold text-xs">
                  Quarto {roomNumber}
                </span>
                <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Reservas do Quarto
                </h2>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {roomCategory} • Dê um duplo clique em uma reserva para alterá-la, ou use as ações abaixo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Top Bar: Nova Reserva no Quarto */}
        <div className={`p-4 border-b flex items-center justify-between gap-4 ${
          isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-100/70 border-slate-200"
        }`}>
          <span className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            Reservas cadastradas neste quarto: <strong className="text-[#0284C7]">{reservations.length}</strong>
          </span>

          <button
            onClick={() => {
              onClose();
              onLancarNovaReservaQuarto(roomNumber);
            }}
            className="px-4 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-[#0284C7]/20 transition"
          >
            <Plus className="w-4 h-4" />
            + Lançar Nova Reserva no Quarto {roomNumber}
          </button>
        </div>

        {/* Content Body / Reservations List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className={`text-center py-12 rounded-2xl border space-y-3 ${
              isDark ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <RefreshCw className="w-8 h-8 text-[#0284C7] animate-spin mx-auto" />
              <h3 className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Buscando reservas do Quarto {roomNumber}...
              </h3>
            </div>
          ) : reservations.length === 0 ? (
            <div className={`text-center py-12 rounded-2xl border space-y-3 ${
              isDark ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                Nenhuma reserva encontrada para o Quarto {roomNumber}
              </h3>
              <p className={`text-xs max-w-md mx-auto ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Este quarto não possui reservas futuras ou ativas no momento. Você pode criar uma nova reserva preenchida diretamente.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onLancarNovaReservaQuarto(roomNumber);
                }}
                className="px-5 py-2.5 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-md transition"
              >
                <Plus className="w-4 h-4" />
                Lançar Reserva Agora
              </button>
            </div>
          ) : (
            reservations.map((res, index) => (
              <div
                key={res.id || index}
                onDoubleClick={() => {
                  if (onSelectAlterarReserva) {
                    onClose();
                    onSelectAlterarReserva(res);
                  }
                }}
                title={onSelectAlterarReserva ? "Dê um duplo clique para alterar esta reserva" : undefined}
                className={`p-5 rounded-2xl border space-y-4 transition-all ${
                  onSelectAlterarReserva ? "cursor-pointer" : ""
                } ${
                  isDark
                    ? "bg-slate-900/90 border-slate-800 hover:border-[#0284C7]/50"
                    : "bg-white border-slate-200 shadow-sm hover:border-[#0284C7]/50"
                }`}
              >
                {/* Header row of Card */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {res.reservationNumber || res.id}
                      </span>
                      <h4 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                        {res.guestName}
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      {res.cpf && <span>CPF: <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{res.cpf}</strong></span>}
                      {res.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-500" /> {res.phone}
                        </span>
                      )}
                      {res.company && (
                        <span className="flex items-center gap-1 text-blue-400 font-medium">
                          <Building2 className="w-3 h-3" /> {res.company}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#0284C7]/15 text-[#38BDF8] border border-[#0284C7]/30 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {res.status || "CONFIRMADA"}
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <span className="text-[10px] text-slate-400 block uppercase font-mono">Período de Hospedagem</span>
                    <span className={`font-semibold font-mono block mt-0.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                      {res.checkInDate} a {res.checkOutDate}
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <span className="text-[10px] text-slate-400 block uppercase font-mono">Valores & Diárias</span>
                    <span className="font-bold text-emerald-500 block mt-0.5">
                      Total: R$ {(res.totalAmount || 0).toFixed(2).replace(".", ",")}
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <span className="text-[10px] text-slate-400 block uppercase font-mono">Tarifa Aplicada</span>
                    <span className={`font-medium block mt-0.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      {res.tariffName || "Standard Flexível"}
                    </span>
                  </div>
                </div>

                {/* Actions for this specific reservation */}
                <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                  {onEfetuarCheckin && (
                    <button
                      onClick={() => onEfetuarCheckin(res)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-[#10B981] hover:bg-[#059669] text-white flex items-center gap-1.5 shadow-md transition"
                    >
                      <UserCheck className="w-4 h-4" />
                      Efetuar Check-in desta Reserva
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onClose();
                      onSelectAlterarPeriodo(res);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
                      isDark 
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20" 
                        : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Alterar Período / Datas
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      onSelectAlterarTarifa(res);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
                      isDark 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" 
                        : "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Alterar Tarifa / Valores
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      onSelectLancarPagamento(res);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
                      isDark 
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20" 
                        : "bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Lançar Pagamento
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-end ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50"
        }`}>
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-semibold border transition ${
              isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
