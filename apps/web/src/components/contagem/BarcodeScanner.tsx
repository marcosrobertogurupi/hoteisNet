"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

// Formatos de código de barras comuns em produtos de mercado / bebidas / industrializados.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];

// Ignora releituras do mesmo código dentro dessa janela (o leitor dispara várias vezes por segundo).
const DEDUPE_MS = 1600;

type Props = {
  active: boolean;
  onDetected: (code: string) => void;
};

// Leitor de código de barras pela câmera traseira do celular. Usa a API nativa `BarcodeDetector`
// quando o navegador tem (Android Chrome, iOS 17+) e cai para `@zxing/browser` nos demais.
export default function BarcodeScanner({ active, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastHitRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [status, setStatus] = useState<"idle" | "starting" | "running" | "denied" | "error">("idle");
  const [engine, setEngine] = useState<"native" | "zxing" | null>(null);

  const emit = useCallback((raw: string) => {
    const code = (raw || "").trim();
    if (!code) return;
    const now = Date.now();
    if (lastHitRef.current.code === code && now - lastHitRef.current.at < DEDUPE_MS) return;
    lastHitRef.current = { code, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    onDetectedRef.current(code);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        /* noop */
      }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const Native = (window as any).BarcodeDetector;
      if (Native) {
        let formats = FORMATS;
        try {
          const supported: string[] = await Native.getSupportedFormats();
          formats = FORMATS.filter((f) => supported.includes(f));
          if (formats.length === 0) formats = supported;
        } catch {
          /* usa a lista padrão */
        }
        const detector = new Native({ formats });
        setEngine("native");
        setStatus("running");
        const tick = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            const hits = await detector.detect(videoRef.current);
            if (hits && hits.length) emit(hits[0].rawValue);
          } catch {
            /* frame ruim — ignora */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Fallback ZXing — carregado sob demanda para não pesar no bundle de quem tem a API nativa.
      // Sem hints de formato: o leitor multi-formato tenta todos (mais tolerante em câmeras fracas).
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      setEngine("zxing");
      setStatus("running");
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) emit(result.getText());
      });
      zxingControlsRef.current = controls;
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        console.warn("[BarcodeScanner] Permissão de câmera negada.");
        setStatus("denied");
      } else {
        console.error("[BarcodeScanner] Erro ao iniciar a câmera:", err);
        setStatus("error");
      }
      stop();
    }
  }, [emit, stop]);

  useEffect(() => {
    if (active) start();
    else stop();
    return stop;
    // start/stop são estáveis (useCallback)
  }, [active, start, stop]);

  return (
    <div className="relative w-full aspect-[3/4] max-h-[52vh] rounded-2xl overflow-hidden bg-black border border-slate-800">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

      {/* Mira */}
      {status === "running" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4/5 h-24 border-2 border-emerald-400/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {(status === "starting" || status === "idle") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-sm">
          <Loader2 className="w-6 h-6 animate-spin" />
          Abrindo a câmera…
        </div>
      )}

      {status === "denied" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-300 text-sm">
          <CameraOff className="w-7 h-7 text-rose-400" />
          Permissão de câmera negada. Libere o acesso à câmera nas configurações do navegador e tente de novo.
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-300 text-sm">
          <CameraOff className="w-7 h-7 text-amber-400" />
          Não foi possível abrir a câmera neste aparelho. Use a busca manual pelo nome do produto.
        </div>
      )}

      {engine === "zxing" && status === "running" && (
        <span className="absolute bottom-2 right-2 text-[9px] font-mono text-slate-400 bg-black/50 px-1.5 py-0.5 rounded">
          leitor compatível
        </span>
      )}
    </div>
  );
}
