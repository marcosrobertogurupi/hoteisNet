"use client";

import React, { useEffect, useState } from "react";
import { ArrowRightLeft, X, Loader2, Check, BedDouble, Sparkles } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

// Tela equivalente à WIN_TransferenciaQuarto do sistema WinDev original: mostra os dados da
// hospedagem do quarto de origem, deixa escolher o quarto de destino (livre e limpo) e move a
// hospedagem via POST /api/stay/transfer-room, que revalida todas as regras no servidor.

export interface TransferRoomStayInfo {
  stayCheckinId: string;
  roomNumber: string;
  roomCategory: string;
  guestName: string;
  checkInDate: string; // ISO
  expectedCheckOutDate: string; // ISO
  dailyCount: number;
  secondaryGuestNames: string[];
}

export interface TransferRoomDestinationOption {
  id: string;
  number: string;
  category: string;
  floor: string;
}

export interface TransferenciaQuartoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceStay: TransferRoomStayInfo | null;
  // Só quartos livres e limpos — o servidor revalida (e checa reservas sobrepostas) ao gravar.
  destinationRoomOptions: TransferRoomDestinationOption[];
  onTransferSuccess?: () => void;
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function TransferenciaQuartoModal({
  isOpen,
  onClose,
  sourceStay,
  destinationRoomOptions,
  onTransferSuccess,
}: TransferenciaQuartoModalProps) {
  const { theme } = useTheme();
  const toast = useToast();

  const [destRoomId, setDestRoomId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Zera a escolha sempre que o modal abre para outra hospedagem.
  useEffect(() => {
    if (isOpen) setDestRoomId("");
  }, [isOpen, sourceStay?.stayCheckinId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !sourceStay) return null;

  const destRoom = destinationRoomOptions.find((r) => r.id === destRoomId) || null;

  const inputYellow = theme.isDark
    ? "bg-slate-800 border-slate-700 text-yellow-300"
    : "bg-yellow-50 border-yellow-200 text-slate-900";
  const cardCls = `border rounded-lg p-3 space-y-3 ${theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`;

  const handleTransfer = async () => {
    if (isSaving) return;
    if (!destRoom) {
      toast.warning("Selecione o quarto de destino antes de transferir.", "Quarto Destino Obrigatório");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/stay/transfer-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stayCheckinId: sourceStay.stayCheckinId, toRoomId: destRoom.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha ao transferir o hóspede de quarto.");

      toast.success(
        data.message || `Hospedagem transferida do quarto ${sourceStay.roomNumber} para o quarto ${destRoom.number}.`,
        "Transferência Concluída"
      );
      onTransferSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível transferir o hóspede de quarto. Tente novamente.", "Erro na Transferência");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-[#184176] via-[#1E5296] to-[#0284C7] px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-sky-200" />
            <h2 className="font-bold text-sm tracking-wide">Transferência de Quarto</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white disabled:opacity-50"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs overflow-y-auto max-h-[85vh]">
          {/* QUARTO ORIGEM */}
          <div className={cardCls}>
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200 border-b pb-1">Quarto origem:</h3>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quarto</label>
                <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded bg-[#0284C7] text-white shadow-sm inline-block">
                  {sourceStay.roomNumber}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Hóspede Principal</label>
                <input type="text" readOnly value={sourceStay.guestName} className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${inputYellow}`} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Categoria</span>
                <span className="font-bold">{sourceStay.roomCategory}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Chegada</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmtDateTime(sourceStay.checkInDate)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold">Dt.Prevista Saída</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{fmtDateTime(sourceStay.expectedCheckOutDate)}</span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] text-slate-500 font-semibold">Diárias</span>
                <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 border border-yellow-400/40">
                  {sourceStay.dailyCount}
                </span>
              </div>
            </div>
            {sourceStay.secondaryGuestNames.length > 0 && (
              <div>
                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Acompanhantes</span>
                <ul className={`rounded border divide-y text-[11px] ${theme.isDark ? "border-slate-700 divide-slate-700" : "border-slate-200 divide-slate-200"}`}>
                  {sourceStay.secondaryGuestNames.map((name, i) => (
                    <li key={`${name}-${i}`} className="px-2 py-1 font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* QUARTO DESTINO */}
          <div className={cardCls}>
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200 border-b pb-1">Quarto destino (livre e limpo):</h3>
            {destinationRoomOptions.length === 0 ? (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                  theme.isDark ? "bg-amber-950/40 border-amber-800 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-800"
                }`}
              >
                <BedDouble className="w-4 h-4 shrink-0" />
                Não há nenhum quarto livre e limpo disponível para receber esta hospedagem no momento.
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quartos</label>
                <select
                  value={destRoomId}
                  onChange={(e) => setDestRoomId(e.target.value)}
                  className={`w-full font-bold p-1.5 rounded border outline-none ${inputYellow}`}
                >
                  <option value="">Selecione...</option>
                  {destinationRoomOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.number} — {r.category} · {r.floor}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
              theme.isDark ? "bg-sky-950/40 border-sky-800 text-sky-200" : "bg-sky-50 border-sky-200 text-sky-900"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Ao confirmar, o quarto <strong>{sourceStay.roomNumber}</strong> será enviado para <strong>limpeza</strong>
              {destRoom ? (
                <>
                  {" "}
                  e a hospedagem passará a ocupar o quarto <strong>{destRoom.number}</strong>.
                </>
              ) : (
                "."
              )}
            </span>
          </div>

          <button
            onClick={handleTransfer}
            disabled={isSaving || !destRoom}
            title={isSaving ? "Transferindo... Aguarde" : "Transferir hóspede de quarto"}
            className="w-full py-3 px-4 rounded-xl bg-[#00BCD4] hover:bg-cyan-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6 stroke-[3]" />}
            {isSaving ? "Transferindo... Aguarde" : "Transferir quarto"}
          </button>
        </div>
      </div>
    </div>
  );
}
