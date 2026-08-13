"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from "lucide-react";

export interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  occupiedDates?: string[]; // Array of YYYY-MM-DD dates that are occupied
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  label?: string;
  placeholder?: string;
  isDark?: boolean;
  type?: "date" | "datetime-local";
  defaultTime?: string; // e.g. "14:00" or "12:00"
  className?: string;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseDateValue(val: string): { dateStr: string; timeStr: string } {
  if (!val) {
    const now = new Date();
    const d = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const t = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    return { dateStr: d, timeStr: t };
  }

  if (val.includes("T")) {
    const [d, t] = val.split("T");
    return { dateStr: d, timeStr: t ? t.substring(0, 5) : "12:00" };
  }

  if (val.includes(" ")) {
    const [d, t] = val.split(" ");
    return { dateStr: d, timeStr: t ? t.substring(0, 5) : "12:00" };
  }

  return { dateStr: val, timeStr: "12:00" };
}

function formatBrDisplay(val: string, type: "date" | "datetime-local"): string {
  if (!val) return "";
  const { dateStr, timeStr } = parseDateValue(val);
  const parts = dateStr.split("-");
  if (parts.length !== 3) return val;
  const br = `${parts[2]}/${parts[1]}/${parts[0]}`;
  return type === "datetime-local" ? `${br} ${timeStr}` : br;
}

export default function CustomDatePicker({
  value,
  onChange,
  occupiedDates = [],
  minDate,
  maxDate,
  label,
  placeholder = "Selecione a data",
  isDark = true,
  type = "datetime-local",
  defaultTime = "12:00",
  className = "",
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { dateStr, timeStr } = parseDateValue(value);

  // Current view month & year in calendar
  const initialViewDate = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(initialViewDate.getFullYear() || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(initialViewDate.getMonth() || new Date().getMonth());
  const [selectedTime, setSelectedTime] = useState(timeStr || defaultTime);

  // Sync view when value changes
  useEffect(() => {
    if (dateStr) {
      const d = new Date(`${dateStr}T00:00:00`);
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [dateStr]);

  // Sync selected time
  useEffect(() => {
    if (timeStr) {
      setSelectedTime(timeStr);
    }
  }, [timeStr]);

  // Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleSelectDay = (day: number) => {
    const formattedDate = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;

    // Check if occupied
    if (occupiedDates.includes(formattedDate)) {
      return; // Block occupied selection
    }

    if (minDate && formattedDate < minDate) {
      return; // Block past min date
    }

    if (maxDate && formattedDate > maxDate) {
      return; // Block future max date
    }

    const newValue = type === "datetime-local" ? `${formattedDate}T${selectedTime}` : formattedDate;
    onChange(newValue);
    setIsOpen(false);
  };

  const handleTimeChange = (newTime: string) => {
    setSelectedTime(newTime);
    if (dateStr) {
      onChange(`${dateStr}T${newTime}`);
    }
  };

  // Generate calendar matrix
  const getDaysInMonth = () => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const days: { day: number; isCurrentMonth: boolean; dateYMD: string }[] = [];

    // Prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const pDay = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        day: pDay,
        isCurrentMonth: false,
        dateYMD: `${prevY}-${pad2(prevM + 1)}-${pad2(pDay)}`,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        dateYMD: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`,
      });
    }

    // Next month padding to complete grid
    const remaining = 35 - days.length > 0 ? 35 - days.length : 42 - days.length;
    for (let j = 1; j <= remaining; j++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        day: j,
        isCurrentMonth: false,
        dateYMD: `${nextY}-${pad2(nextM + 1)}-${pad2(j)}`,
      });
    }

    return days;
  };

  const todayStr = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  })();

  const displayVal = formatBrDisplay(value, type);

  // Theme styles
  const inputBg = isDark
    ? "bg-slate-800/90 border-slate-600/70 text-white hover:border-[#00b4d8]"
    : "bg-white border-slate-300 text-slate-900 hover:border-sky-500 shadow-sm";

  const popoverBg = isDark
    ? "bg-[#0F172A] border-slate-700 text-white shadow-2xl"
    : "bg-white border-slate-200 text-slate-900 shadow-xl";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{label}</label>}

      {/* INPUT TRIGGER BUTTON */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors ${inputBg}`}
      >
        <span className={displayVal ? "font-mono font-bold" : "text-slate-400"}>
          {displayVal || placeholder}
        </span>
        <CalendarIcon className={`w-3.5 h-3.5 ${isDark ? "text-[#00b4d8]" : "text-sky-600"} ml-1 shrink-0`} />
      </button>

      {/* POPOVER CALENDAR */}
      {isOpen && (
        <div className={`absolute z-[9999] top-full mt-1 left-0 sm:left-auto sm:right-0 w-[290px] p-3 rounded-xl border ${popoverBg} space-y-2.5 font-sans shadow-2xl`}>
          
          {/* HEADER MONTH NAVIGATOR */}
          <div className="flex items-center justify-between border-b pb-2 border-slate-700/50">
            <button
              type="button"
              onClick={handlePrevMonth}
              className={`p-1 rounded-lg hover:bg-slate-700/50 transition-colors ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-xs font-bold font-mono">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className={`p-1 rounded-lg hover:bg-slate-700/50 transition-colors ${isDark ? "text-slate-300" : "text-slate-600"}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* WEEKDAY HEADERS */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] uppercase opacity-70">
            {WEEKDAY_NAMES.map(w => (
              <span key={w}>{w}</span>
            ))}
          </div>

          {/* CALENDAR DAYS GRID */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium">
            {getDaysInMonth().map((cell, idx) => {
              const isOccupied = occupiedDates.includes(cell.dateYMD);
              const isSelected = cell.dateYMD === dateStr;
              const isToday = cell.dateYMD === todayStr;
              const isPastMin = minDate ? cell.dateYMD < minDate : false;
              const isDisabled = isOccupied || isPastMin;

              let cellStyle = "hover:bg-sky-500/20 text-slate-300";

              if (!cell.isCurrentMonth) {
                cellStyle = "text-slate-600 opacity-40";
              }

              if (isOccupied) {
                // RED BACKGROUND FOR OCCUPIED DATES (As requested by user)
                cellStyle = "bg-red-600 text-white font-black rounded-lg border border-red-700 shadow-sm cursor-not-allowed opacity-95";
              } else if (isSelected) {
                cellStyle = "bg-[#0284C7] text-white font-bold rounded-lg shadow-md ring-2 ring-sky-400";
              } else if (isToday) {
                cellStyle = isDark
                  ? "bg-sky-500/20 text-sky-400 font-bold border border-sky-500/40 rounded-lg"
                  : "bg-sky-100 text-sky-800 font-bold border border-sky-300 rounded-lg";
              } else if (isPastMin) {
                cellStyle = "text-slate-600 cursor-not-allowed opacity-40 line-through";
              } else {
                cellStyle = isDark
                  ? "text-slate-200 hover:bg-slate-700/60 rounded-lg"
                  : "text-slate-800 hover:bg-slate-100 rounded-lg";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(cell.day)}
                  title={isOccupied ? "Data Ocupada (Reserva Ativa no Quarto)" : cell.dateYMD}
                  className={`py-1.5 w-full text-center transition-all ${cellStyle}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* TIME PICKER IF DATETIME-LOCAL */}
          {type === "datetime-local" && (
            <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between gap-2 text-xs">
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-sky-400" /> Horário:
              </span>
              <input
                type="time"
                value={selectedTime}
                onChange={e => handleTimeChange(e.target.value)}
                className={`px-2 py-1 rounded border text-xs font-mono font-bold ${
                  isDark ? "bg-slate-800 border-slate-600 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>
          )}

          {/* LEGEND FOOTER */}
          <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between text-[9px] text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-red-600 rounded-sm inline-block"></span> Ocupado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-[#0284C7] rounded-sm inline-block"></span> Selecionado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-sky-500/40 border border-sky-400 rounded-sm inline-block"></span> Hoje
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
