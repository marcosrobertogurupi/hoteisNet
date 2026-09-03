"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Botão "Instalar app" para o app de contagem. No Android/Chrome usa o evento
// `beforeinstallprompt`; no iOS (que não expõe esse evento) mostra as instruções do Safari.
// Some quando o app já está instalado (rodando em tela cheia).
export default function PwaInstallButton() {
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

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full py-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm font-semibold flex items-center justify-center gap-2 transition hover:bg-emerald-500/20"
      >
        <Download className="w-4 h-4" /> Instalar app na tela inicial
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-[#0e1524] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Instalar no iPhone</h3>
              <button onClick={() => setShowIosHelp(false)} className="p-1.5 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal list-inside">
              <li>
                Toque no botão <Share className="w-4 h-4 inline -mt-0.5" /> <b>Compartilhar</b> na barra do Safari.
              </li>
              <li>
                Escolha <b>"Adicionar à Tela de Início"</b>.
              </li>
              <li>Confirme em <b>Adicionar</b>.</li>
            </ol>
            <p className="text-[11px] text-slate-500">
              Precisa estar no Safari (não funciona dentro de outro app).
            </p>
          </div>
        </div>
      )}
    </>
  );
}
