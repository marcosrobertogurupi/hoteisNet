"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAppVersion } from "@/lib/useAppVersion";
import { reloadForUpdate } from "@/lib/reloadForUpdate";

// Aviso de versão desatualizada + atualização obrigatória. Montado nos layouts do app do hotel
// (/app) e dos apps satélite (/housekeeping, /contagem). A verificação em si vive em
// useAppVersion (determinística, sem IA).
//
//  - Versão nova disponível (não crítica) → faixa fina no rodapé, com "Atualizar agora" e um X
//    para dispensar por 6h. O operador segue trabalhando se quiser.
//  - Versão nova CRÍTICA → a faixa do rodapé fica vermelha, sem X, e NÃO some enquanto o operador
//    usa o sistema: continua ali até ele atualizar. Além disso, depois de CRITICAL_IDLE_MS sem
//    nenhuma atividade de mouse/teclado/toque, um overlay cobre a tela e só deixa "Atualizar
//    agora" — e, uma vez exibido, permanece até a atualização (é obrigatória).
//
// Os sinais de "desatualizado" e "crítico" são LATCHED (uma vez vistos, ficam): uma aba
// desatualizada só deixa de estar desatualizada recarregando, e um blip de rede/servidor
// devolvendo momentaneamente "não crítico" não pode fazer o aviso sumir do rodapé.

const CRITICAL_IDLE_MS = 120_000;
const IDLE_CHECK_MS = 5_000;
const DISMISS_MS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "hn_version_dismiss_until";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"] as const;

export default function AppVersionGate({ variant = "app" }: { variant?: "app" | "satellite" }) {
  const { theme } = useTheme();
  const { updateAvailable, critical, message } = useAppVersion();

  // Sinais latched — ver comentário no topo.
  const [stale, setStale] = useState(false);
  const [criticalSeen, setCriticalSeen] = useState(false);
  const [latchedMessage, setLatchedMessage] = useState<string | null>(null);

  const [dismissedUntil, setDismissedUntil] = useState<number>(0);
  const [forceBlock, setForceBlock] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (updateAvailable) setStale(true);
    if (updateAvailable && critical) setCriticalSeen(true);
    if (message) setLatchedMessage(message);
  }, [updateAvailable, critical, message]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) setDismissedUntil(Number(raw) || 0);
    } catch {
      // localStorage indisponível — sem problema, a faixa só não fica "dispensada"
    }
  }, []);

  // Timer de inatividade — só liga depois que a atualização crítica foi vista. Mesmo padrão do
  // InactivityLock (components/InactivityLock.tsx). forceBlock nunca é revertido: uma vez que a
  // tela bloqueante apareceu, ela fica até o operador atualizar.
  useEffect(() => {
    if (!criticalSeen) return;
    lastActivityRef.current = Date.now();
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true, capture: true }));
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= CRITICAL_IDLE_MS) setForceBlock(true);
    }, IDLE_CHECK_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump, { capture: true } as EventListenerOptions));
      window.clearInterval(interval);
    };
  }, [criticalSeen]);

  // Trava o scroll do body enquanto o overlay bloqueante está aberto.
  useEffect(() => {
    if (!forceBlock) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [forceBlock]);

  const doUpdate = useCallback(() => {
    void reloadForUpdate();
  }, []);

  const dismiss = useCallback(() => {
    const until = Date.now() + DISMISS_MS;
    setDismissedUntil(until);
    try {
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {
      // ignora
    }
  }, []);

  if (!stale) return null;

  // A faixa crítica nunca é dispensável nem some com o uso; só a não crítica pode ser adiada 6h.
  const bannerHidden = !criticalSeen && Date.now() < dismissedUntil;
  const isDark = theme.isDark;
  const msg = latchedMessage;

  return (
    <>
      {!bannerHidden && (
        <div
          className={`fixed inset-x-0 bottom-0 z-[11400] border-t px-4 py-2.5 flex items-center gap-3 text-sm shadow-lg ${
            criticalSeen
              ? "bg-red-600 border-red-700 text-white"
              : isDark
                ? "bg-slate-900 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800"
          } ${variant === "satellite" ? "flex-col sm:flex-row text-center sm:text-left" : ""}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {criticalSeen ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 text-[#0284C7]" />
            )}
            <span className="truncate">
              {criticalSeen
                ? msg || "Atualização obrigatória do sistema disponível."
                : "Uma nova versão do sistema está disponível."}
            </span>
          </div>
          <button
            onClick={doUpdate}
            className={`shrink-0 px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition ${
              criticalSeen
                ? "bg-white text-red-700 hover:bg-red-50"
                : "bg-[#0284C7] text-white hover:brightness-110"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar agora
          </button>
          {!criticalSeen && (
            <button
              onClick={dismiss}
              className={`shrink-0 p-1 rounded-md transition ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
              aria-label="Dispensar por 6 horas"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {forceBlock && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className={`w-full max-w-sm rounded-2xl border p-6 text-center space-y-4 shadow-2xl ${theme.bgCard}`}>
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div className="space-y-1.5">
              <h2 className={`text-base font-bold ${theme.textMain}`}>Atualização obrigatória</h2>
              <p className={`text-sm ${theme.textMuted}`}>
                {msg ||
                  "Uma nova versão do sistema foi publicada e precisa ser aplicada para continuar. Nenhum dado não salvo é perdido além do que já estiver aberto."}
              </p>
            </div>
            <button
              onClick={doUpdate}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-500 transition"
            >
              <RefreshCw className="w-4 h-4" /> Atualizar agora
            </button>
          </div>
        </div>
      )}
    </>
  );
}
