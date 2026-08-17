"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface DateRangeCalendarPickerProps {
  isOpen: boolean;
  onClose: () => void;
  checkInLocal: string; // "YYYY-MM-DDTHH:mm"
  checkOutLocal: string; // "YYYY-MM-DDTHH:mm"
  minDateYMD?: string; // dates before this are blocked (default: today)
  onSelectStart: (dateYMD: string) => void;
  onSelectEnd: (dateYMD: string) => void;
  isDark?: boolean;
  /** Quando true, a data de chegada é fixa (ex: check-in sempre "hoje") e todo clique define apenas a saída. */
  lockStart?: boolean;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ymdOf(localStr: string): string {
  return localStr ? localStr.split("T")[0] : "";
}

export default function DateRangeCalendarPicker({
  isOpen,
  onClose,
  checkInLocal,
  checkOutLocal,
  minDateYMD,
  onSelectStart,
  onSelectEnd,
  isDark = true,
  lockStart = false,
}: DateRangeCalendarPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const minYMD = minDateYMD || todayYMD();

  const startYMD = ymdOf(checkInLocal);
  const endYMD = ymdOf(checkOutLocal);

  const initialView = startYMD ? new Date(`${startYMD}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());

  // Se o usuário já clicou na data inicial e aguarda o clique na data final desta sessão de seleção
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const v = startYMD ? new Date(`${startYMD}T00:00:00`) : new Date();
      setViewYear(v.getFullYear());
      setViewMonth(v.getMonth());
      setPendingStart(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const handleDayClick = (dateYMD: string) => {
    if (dateYMD < minYMD) return;

    if (lockStart) {
      // Chegada é fixa: todo clique define apenas a data de saída.
      if (dateYMD > startYMD) onSelectEnd(dateYMD);
      return;
    }

    if (!pendingStart) {
      // Primeiro clique desta seleção: define a data de chegada e aguarda o clique da saída
      onSelectStart(dateYMD);
      setPendingStart(dateYMD);
      return;
    }

    if (dateYMD <= pendingStart) {
      // Clique numa data igual/anterior à inicial: recomeça a seleção a partir dela
      onSelectStart(dateYMD);
      setPendingStart(dateYMD);
      return;
    }

    // Segundo clique: define a data de saída e conclui a seleção
    onSelectEnd(dateYMD);
    setPendingStart(null);
  };

  const getDaysInMonth = () => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const days: { day: number; isCurrentMonth: boolean; dateYMD: string }[] = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      const pDay = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ day: pDay, isCurrentMonth: false, dateYMD: `${prevY}-${pad2(prevM + 1)}-${pad2(pDay)}` });
    }

    for (let d = 1; d <= totalDays; d++) {
      days.push({ day: d, isCurrentMonth: true, dateYMD: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}` });
    }

    const remaining = (days.length > 35 ? 42 : 35) - days.length;
    for (let j = 1; j <= remaining; j++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ day: j, isCurrentMonth: false, dateYMD: `${nextY}-${pad2(nextM + 1)}-${pad2(j)}` });
    }

    return days;
  };

  const todayStr = todayYMD();

  const panelBg = isDark
    ? "bg-[#0F172A] border-slate-700 text-white shadow-2xl"
    : "bg-white border-slate-200 text-slate-900 shadow-xl";

  return (
    <div
      ref={containerRef}
      className={`absolute z-[9999] top-full mt-1 left-0 w-[300px] rounded-xl border ${panelBg} font-sans overflow-hidden`}
    >
      {/* Cabeçalho com navegação de mês */}
      <div className={`flex items-center justify-between px-2 py-2 border-b ${isDark ? "border-slate-700/60" : "border-slate-200"}`}>
        <button
          type="button"
          onClick={handlePrevMonth}
          className={`p-1 rounded-lg transition-colors ${isDark ? "text-slate-300 hover:bg-slate-700/50" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          className={`p-1 rounded-lg transition-colors ${isDark ? "text-slate-300 hover:bg-slate-700/50" : "text-slate-600 hover:bg-slate-100"}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Dias da semana */}
      <div className={`grid grid-cols-7 text-center font-bold text-[10px] py-1 ${isDark ? "bg-slate-800 text-slate-300" : "bg-[#00b4d8] text-white"}`}>
        {WEEKDAY_NAMES.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold p-1.5">
        {getDaysInMonth().map((cell, idx) => {
          const isBlocked = cell.dateYMD < minYMD;
          const isStart = cell.dateYMD === startYMD;
          const isEnd = cell.dateYMD === endYMD;
          const isInRange = startYMD && endYMD && cell.dateYMD > startYMD && cell.dateYMD < endYMD;
          const isToday = cell.dateYMD === todayStr;

          let cellStyle = "";
          if (!cell.isCurrentMonth) {
            cellStyle = isDark ? "text-slate-600 opacity-50" : "text-slate-300";
          } else if (isBlocked) {
            cellStyle = isDark ? "text-slate-700 opacity-40 cursor-not-allowed" : "text-slate-300 cursor-not-allowed";
          } else if (isStart) {
            cellStyle = "bg-emerald-500 text-white font-bold rounded shadow ring-2 ring-emerald-300";
          } else if (isEnd) {
            cellStyle = "bg-amber-500 text-white font-bold rounded shadow ring-2 ring-amber-300";
          } else if (isInRange) {
            cellStyle = isDark ? "bg-sky-500/20 text-sky-300 font-bold rounded" : "bg-sky-100 text-sky-800 font-bold rounded";
          } else {
            cellStyle = isDark ? "text-slate-200 hover:bg-slate-700/60 rounded cursor-pointer" : "text-slate-800 hover:bg-slate-100 rounded cursor-pointer";
          }

          const todayRing = isToday && !isStart && !isEnd ? " border-2 border-red-500" : "";

          return (
            <button
              key={idx}
              type="button"
              disabled={isBlocked || !cell.isCurrentMonth}
              onClick={() => handleDayClick(cell.dateYMD)}
              title={cell.dateYMD}
              className={`py-1 transition-all ${cellStyle}${todayRing}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Rodapé: Fechar / Hoje */}
      <div className={`flex items-center justify-between px-2.5 py-2 border-t ${isDark ? "border-slate-700/60" : "border-slate-200"}`}>
        <button
          type="button"
          onClick={goToToday}
          className={`text-[11px] font-semibold underline underline-offset-2 ${isDark ? "text-[#00b4d8] hover:text-cyan-300" : "text-sky-600 hover:text-sky-700"}`}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-white ${isDark ? "bg-[#00b4d8] hover:bg-cyan-600" : "bg-sky-600 hover:bg-sky-700"}`}
        >
          <X className="w-3 h-3" /> Fechar
        </button>
      </div>

      {/* Legenda */}
      <div className={`flex items-center justify-between px-2.5 pb-2 text-[9px] font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> Chegada</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 rounded-sm inline-block" /> Saída</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 border-2 border-red-500 rounded-sm inline-block" /> Hoje</span>
      </div>
    </div>
  );
}
