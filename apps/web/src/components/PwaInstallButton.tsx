"use client";

import { useEffect, useState } from "react";
import { Download, Share, X, MoreVertical } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Guarda global preenchida pelo script inline do layout (ver housekeeping/contagem layout.tsx):
// o `beforeinstallprompt` do Chrome costuma disparar antes do React hidratar, então precisa ser
// capturado o mais cedo possível. Aqui a gente só lê o que já foi capturado (e continua ouvindo
// caso dispare depois).
declare global {
  interface Window {
    __bipEvent?: BeforeInstallPromptEvent | null;
  }
}

// Botão "Instalar app" compartilhado pelos apps satélite mobile (Contagem de Estoque, Governança).
// - Android/Chrome com o app instalável: usa o evento `beforeinstallprompt` (prompt nativo).
// - Android sem o evento (Firefox, Samsung Internet, ou evento perdido): mostra o passo a passo do
//   menu do navegador.
// - iOS: mostra as instruções do Safari (iOS não expõe o evento).
// Some só quando o app já está rodando instalado (tela cheia). `accent` segue a cor do app chamador.
export default function PwaInstallButton({ accent = "emerald" }: { accent?: "emerald" | "rose" }) {
  const { theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, accent);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [help, setHelp] = useState<null | "ios" | "android">(null);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(!!standalone);

    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)) setPlatform("ios");
    else if (/android/i.test(ua)) setPlatform("android");
    else setPlatform("other");

    // Evento que o script inline do layout pode já ter capturado antes do React montar.
    if (window.__bipEvent) setDeferred(window.__bipEvent);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__bipEvent = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.__bipEvent = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && platform === "other") return null; // desktop / navegador sem caminho de instalação

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      window.__bipEvent = null;
      return;
    }
    setHelp(platform === "ios" ? "ios" : "android");
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

      {help && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`w-full sm:max-w-sm border-t sm:border rounded-t-3xl sm:rounded-3xl p-5 space-y-3 ${ui.sheet}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold ${theme.textMain}`}>
                {help === "ios" ? "Instalar no iPhone" : "Instalar no Android"}
              </h3>
              <button onClick={() => setHelp(null)} className={`p-1.5 ${theme.textMuted}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {help === "ios" ? (
              <ol className={`text-sm space-y-2 list-decimal list-inside ${theme.textMuted}`}>
                <li>
                  Toque no botão <Share className="w-4 h-4 inline -mt-0.5" /> <b>Compartilhar</b> na barra do Safari.
                </li>
                <li>
                  Escolha <b>&quot;Adicionar à Tela de Início&quot;</b>.
                </li>
                <li>Confirme em <b>Adicionar</b>.</li>
              </ol>
            ) : (
              <ol className={`text-sm space-y-2 list-decimal list-inside ${theme.textMuted}`}>
                <li>
                  Toque no menu <MoreVertical className="w-4 h-4 inline -mt-0.5" /> (três pontos) no canto do navegador.
                </li>
                <li>
                  Escolha <b>&quot;Instalar app&quot;</b> ou <b>&quot;Adicionar à tela inicial&quot;</b>.
                </li>
                <li>Confirme. O ícone <b>{accent === "rose" ? "Governança" : "Contagem"}</b> aparece junto dos outros apps.</li>
              </ol>
            )}

            <p className={`text-[11px] ${ui.faint}`}>
              {help === "ios"
                ? "Precisa estar no Safari (não funciona dentro de outro app)."
                : "Use o Chrome. Dentro do WhatsApp/Instagram não funciona — abra o link no navegador."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
