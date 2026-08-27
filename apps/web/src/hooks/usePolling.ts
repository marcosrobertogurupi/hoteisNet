import { useEffect, useRef } from "react";

interface UsePollingOptions {
  /**
   * Quando true, o polling fica suspenso (ex.: um modal aberto por cima do Mapa de
   * Quartos / Mapa de Reservas — regra herdada do projeto original em WinDev: telas de
   * mapa se atualizam sozinhas, janelas abertas por cima pausam a atualização).
   */
  paused?: boolean;
  /** Dispara o callback uma vez imediatamente ao montar. Padrão: true. */
  runOnMount?: boolean;
}

/**
 * Executa `callback` a cada `intervalMs`, mas:
 *  - NÃO dispara enquanto a aba está em segundo plano (`document.hidden`) e faz uma
 *    chamada imediata assim que a aba volta ao primeiro plano;
 *  - fica totalmente suspenso enquanto `paused` for true.
 *
 * Existe para conter o volume de saída de dados do Supabase (egress do pooler): um
 * recepcionista com várias abas abertas deixava cada aba oculta consultando o banco a
 * cada 3 s sem ninguém olhando. O frescor das telas visíveis é preservado.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  { paused = false, runOnMount = true }: UsePollingOptions = {}
): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (paused) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const run = () => {
      void callbackRef.current();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        if (!document.hidden) run();
      }, intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        run();
        start();
      }
    };

    if (runOnMount) run();
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, paused, runOnMount]);
}
