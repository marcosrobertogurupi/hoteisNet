"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X
} from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextData {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
  warning: (message: string, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextData>({} as ToastContextData);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", title?: string, duration: number = 4500) => {
      const id = `TOAST-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep max 5 visible toasts

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, "success", title || "Sucesso!", duration);
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, "error", title || "Atenção!", duration);
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, "info", title || "Informação", duration);
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, "warning", title || "Aviso", duration);
    },
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{ showToast, success, error, info, warning, removeToast }}
    >
      {children}

      {/* Floating Toast Display Container */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map((toast) => {
          let bgClass = "bg-slate-900/95 border-slate-700 text-white shadow-slate-950/40";
          let icon = <Info className="w-5 h-5 text-sky-400 shrink-0" />;
          let barBg = "bg-sky-500 shadow-sky-500/50";

          if (toast.type === "success") {
            bgClass = "bg-slate-900/95 border-emerald-500/50 text-white shadow-emerald-950/30";
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
            barBg = "bg-emerald-500 shadow-emerald-500/50";
          } else if (toast.type === "error") {
            bgClass = "bg-slate-900/95 border-rose-500/50 text-white shadow-rose-950/30";
            icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
            barBg = "bg-rose-500 shadow-rose-500/50";
          } else if (toast.type === "warning") {
            bgClass = "bg-slate-900/95 border-amber-500/50 text-white shadow-amber-950/30";
            icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
            barBg = "bg-amber-500 shadow-amber-500/50";
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto relative overflow-hidden p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start gap-3 transition-all duration-300 transform animate-in slide-in-from-top-4 fade-in ${bgClass}`}
            >
              {/* Left Accent Bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${barBg} shadow-lg`} />

              <div className="pt-0.5 ml-1">{icon}</div>

              <div className="flex-1 min-w-0 pr-2">
                {toast.title && (
                  <h4 className="font-bold text-xs uppercase tracking-wider text-white mb-1 flex items-center gap-1.5">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de um ToastProvider");
  }
  return context;
}
