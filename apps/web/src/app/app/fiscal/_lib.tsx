"use client";

import { X } from "lucide-react";

// Helpers de estilo compartilhados pelas abas do módulo Fiscal / PDV. Seguem o padrão do
// projeto: classes condicionais a partir de theme.isDark (respeita o tema de Configurações).

export const inputCls = (isDark: boolean) =>
  `w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none transition ${
    isDark
      ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-sky-500"
      : "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-600"
  }`;

export const labelCls = (isDark: boolean) =>
  `text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`;

export const cardCls = (isDark: boolean) =>
  `border rounded-3xl overflow-hidden shadow-xl ${
    isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
  }`;

export const theadCls = (isDark: boolean) =>
  `font-mono border-b uppercase tracking-wider text-[11px] ${
    isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
  }`;

export const rowCls = (isDark: boolean) =>
  `transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`;

export const primaryBtn =
  "px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-50";

export const ghostBtn = (isDark: boolean) =>
  `px-5 py-2.5 rounded-xl border text-xs font-semibold transition ${
    isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
  }`;

export function Modal({
  isDark,
  title,
  onClose,
  children,
  wide,
}: {
  isDark: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`border rounded-3xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} shadow-2xl overflow-hidden ${
          isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div className={`p-6 border-b flex items-center justify-between ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// Rótulo legível para o regime tributário (Tenant.taxRegime).
export const regimeLabel: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  MEI: "MEI",
};
