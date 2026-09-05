"use client";

import { useState } from "react";
import { usePolling } from "@/lib/usePolling";

// Versão "assada" no bundle desta aba no momento do build (ver next.config.mjs → env).
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

// Intervalo de checagem. Frouxo de propósito: uma nova versão não é urgente ao segundo, e
// usePolling já pausa com a aba em segundo plano. GET /api/version não toca o banco a cada
// chamada (cache de 20s no servidor).
const CHECK_INTERVAL_MS = 60_000;

export interface AppVersionState {
  /** Há uma versão publicada diferente da que esta aba carregou. */
  updateAvailable: boolean;
  /** A atualização é obrigatória (release.json.critical ou override do admin master). */
  critical: boolean;
  /** Mensagem curta opcional para exibir ao operador. */
  message: string | null;
}

/**
 * Compara a versão desta aba com a versão publicada no ar (GET /api/version). Determinístico,
 * sem qualquer chamada de IA. Falha de rede é ignorada silenciosamente — nunca trava a tela.
 */
export function useAppVersion(): AppVersionState {
  const [state, setState] = useState<AppVersionState>({
    updateAvailable: false,
    critical: false,
    message: null,
  });

  usePolling(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { buildId?: string; critical?: boolean; message?: string | null };
      const serverBuildId = data.buildId;
      if (!serverBuildId) return;

      const updateAvailable = serverBuildId !== CLIENT_BUILD_ID;
      setState({
        updateAvailable,
        critical: updateAvailable && data.critical === true,
        message: updateAvailable ? data.message ?? null : null,
      });
    } catch {
      // sem rede / servidor indisponível — mantém o estado atual
    }
  }, CHECK_INTERVAL_MS);

  return state;
}
