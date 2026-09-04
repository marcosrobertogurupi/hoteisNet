"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Botão "Instalar app" compartilhado pelos apps satélite mobile (Contagem de Estoque,
// Governança). No Android/Chrome usa o evento `beforeinstallprompt`; no iOS (que não expõe esse
// evento) mostra as instruções do Safari. Some quando o app já está instalado (rodando em tela
// cheia). `accent` segue a cor de destaque do app chamador (ver lib/satelliteAppUI.ts).
export default function PwaInstallButton({ accent = "emerald" }: { accent?: "emerald" | "rose" }) {
  const { theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, accent);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(!!standalone);

    const ua = window.navigator.userAgent;
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !isIOS) return null; // navegador sem suporte / já dispensado

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setShowIosHelp(true);
  };

  const accentBtn =
    accent === "rose"
      ? `border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 ${theme.isDark ? "text-rose-300" : "text-rose-700"}`
      : `border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 ${theme.isDark ? "text-emerald-300" : "text-emerald-700"}`;

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full py-3 rounded-2xl border text-sm font-semibold flex items-center justify-center gap-2 transition ${accentBtn}`}
      >
        <Download className="w-4 h-4" /> Instalar app na tela inicial
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`w-full sm:max-w-sm border-t sm:border rounded-t-3xl sm:rounded-3xl p-5 space-y-3 ${ui.sheet}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold ${theme.textMain}`}>Instalar no iPhone</h3>
              <button onClick={() => setShowIosHelp(false)} className={`p-1.5 ${theme.textMuted}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className={`text-sm space-y-2 list-decimal list-inside ${theme.textMuted}`}>
              <li>
                Toque no botão <Share className="w-4 h-4 inline -mt-0.5" /> <b>Compartilhar</b> na barra do Safari.
              </li>
              <li>
                Escolha <b>"Adicionar à Tela de Início"</b>.
              </li>
              <li>Confirme em <b>Adicionar</b>.</li>
            </ol>
            <p className={`text-[11px] ${ui.faint}`}>
              Precisa estar no Safari (não funciona dentro de outro app).
            </p>
          </div>
        </div>
      )}
    </>
  );
}
