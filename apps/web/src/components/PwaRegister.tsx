"use client";

import { useEffect } from "react";

// Registra o service worker de um app satélite (Contagem, Governança) — o que torna o app
// instalável ("adicionar à tela inicial" / abrir em tela cheia). Não faz cache de dados.
export default function PwaRegister({ src, scope }: { src: string; scope: string }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register(src, { scope }).catch((err) => {
        console.warn("[PwaRegister] Falha ao registrar o service worker:", err);
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [src, scope]);

  return null;
}
