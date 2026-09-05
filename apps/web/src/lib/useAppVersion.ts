"use client";

import { useState } from "react";
import { usePolling } from "@/lib/usePolling";

// Intervalo de checagem. Frouxo de propósito: uma nova versão não é urgente ao segundo, e
// usePolling já pausa com a aba em segundo plano. GET /api/version não toca o banco a cada
// chamada (cache de 20s no servidor para o override).
const CHECK_INTERVAL_MS = 60_000;

// Build id da versão que ESTA carga de página está rodando. NÃO é um valor "assado" no bundle
// (isso divergiria para sempre do runtime quando a Vercel reaproveita o bundle antigo num deploy
// novo via cache de build). Em vez disso, guardamos aqui o `buildId` da PRIMEIRA resposta de
// /api/version recebida após o carregamento. Vive no escopo do módulo: sobrevive a remontagens
// do componente, mas zera num reload real da página — que é exatamente o que "Atualizar agora"
// faz, então depois de atualizar o aviso não volta.
let baselineBuildId: string | null = null;

export interface AppVersionState {
  /** Há uma versão publicada diferente da que esta aba carregou. */
  updateAvailable: boolean;
  /** A atualização é obrigatória (release.json.critical ou override do admin master). */
  critical: boolean;
  /** Mensagem curta opcional para exibir ao operador. */
  message: string | null;
}

/**
 * Compara o build id que esta aba carregou com o que está publicado no ar (GET /api/version).
 * Determinístico, sem qualquer chamada de IA. Falha de rede é ignorada silenciosamente — nunca
 * trava a tela.
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

      if (baselineBuildId === null) {
        // Primeira leitura desta carga de página = a versão que estamos rodando.
        baselineBuildId = serverBuildId;
        return;
      }

      const updateAvailable = serverBuildId !== baselineBuildId;
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
