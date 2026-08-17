"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { useTheme } from "./ThemeContext";

export type ConfirmVariant = "default" | "danger";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmContextData {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextData>({} as ConfirmContextData);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const normalized: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    setRequest(normalized);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleAnswer = (value: boolean) => {
    setRequest(null);
    resolveRef.current?.(value);
    resolveRef.current = null;
  };

  const isDanger = request?.variant === "danger";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => handleAnswer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-150 ${
              theme.isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            <div className="p-5 flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDanger
                    ? theme.isDark ? "bg-red-500/15 text-red-400" : "bg-red-100 text-red-600"
                    : theme.isDark ? "bg-[#0284C7]/15 text-[#38BDF8]" : "bg-sky-100 text-sky-600"
                }`}
              >
                {isDanger ? <Trash2 className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
              </div>
              <div className="min-w-0 pt-1">
                <h3 className={`font-bold text-sm ${theme.textMain}`}>
                  {request.title || (isDanger ? "Confirmar exclusão" : "Confirmar ação")}
                </h3>
                <p className={`text-xs mt-1.5 leading-relaxed whitespace-pre-line ${theme.textMuted}`}>
                  {request.message}
                </p>
              </div>
            </div>

            <div
              className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${
                theme.isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-100 bg-slate-50"
              }`}
            >
              <button
                onClick={() => handleAnswer(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  theme.isDark
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                }`}
              >
                {request.cancelLabel || "Cancelar"}
              </button>
              <button
                onClick={() => handleAnswer(true)}
                autoFocus
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-colors flex items-center gap-1.5 ${
                  isDanger
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-[#0284C7] hover:bg-[#0369A1]"
                }`}
              >
                {isDanger && <AlertTriangle className="w-3.5 h-3.5" />}
                {request.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm deve ser usado dentro de um ConfirmProvider");
  }
  return context.confirm;
}
