"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Edit3 } from "lucide-react";
import { useTheme } from "./ThemeContext";

export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "email" | "tel" | "number";
  validate?: (value: string) => string | null; // retorna mensagem de erro, ou null se válido
}

interface PromptContextData {
  prompt: (options: PromptOptions | string) => Promise<string | null>;
}

const PromptContext = createContext<PromptContextData>({} as PromptContextData);

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [request, setRequest] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resolveRef = useRef<((value: string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const promptFn = useCallback((options: PromptOptions | string) => {
    const normalized: PromptOptions = typeof options === "string" ? { message: options } : options;
    setRequest(normalized);
    setValue(normalized.defaultValue || "");
    setErrorMsg(null);
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (request) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [request]);

  const handleClose = (result: string | null) => {
    setRequest(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  const handleConfirm = () => {
    if (!request) return;
    const trimmed = value.trim();
    if (request.validate) {
      const err = request.validate(trimmed);
      if (err) {
        setErrorMsg(err);
        return;
      }
    }
    handleClose(trimmed);
  };

  return (
    <PromptContext.Provider value={{ prompt: promptFn }}>
      {children}

      {request && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => handleClose(null)}
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
                  theme.isDark ? "bg-[#0284C7]/15 text-[#38BDF8]" : "bg-sky-100 text-sky-600"
                }`}
              >
                <Edit3 className="w-5 h-5" />
              </div>
              <div className="min-w-0 pt-1 flex-1">
                <h3 className={`font-bold text-sm ${theme.textMain}`}>
                  {request.title || "Informe o valor"}
                </h3>
                {request.message && (
                  <p className={`text-xs mt-1.5 leading-relaxed whitespace-pre-line ${theme.textMuted}`}>
                    {request.message}
                  </p>
                )}

                <input
                  ref={inputRef}
                  type={request.inputType || "text"}
                  value={value}
                  placeholder={request.placeholder}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirm();
                    if (e.key === "Escape") handleClose(null);
                  }}
                  className={`mt-3 w-full px-3 py-2 rounded-lg text-xs font-semibold outline-none border transition-colors ${
                    theme.isDark
                      ? "bg-slate-900 border-slate-700 text-white focus:border-sky-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-sky-500"
                  } ${errorMsg ? "border-red-500 focus:border-red-500" : ""}`}
                />
                {errorMsg && (
                  <p className="text-[11px] mt-1.5 font-semibold text-red-500">{errorMsg}</p>
                )}
              </div>
            </div>

            <div
              className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${
                theme.isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-100 bg-slate-50"
              }`}
            >
              <button
                onClick={() => handleClose(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  theme.isDark
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                }`}
              >
                {request.cancelLabel || "Cancelar"}
              </button>
              <button
                onClick={handleConfirm}
                autoFocus
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-colors bg-[#0284C7] hover:bg-[#0369A1]"
              >
                {request.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const context = useContext(PromptContext);
  if (!context) {
    throw new Error("usePrompt deve ser usado dentro de um PromptProvider");
  }
  return context.prompt;
}
