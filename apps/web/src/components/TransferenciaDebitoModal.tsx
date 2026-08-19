"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, X, Loader2, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useOperator } from "@/context/OperatorContext";

export interface TransferDebitStayInfo {
  stayCheckinId: string;
  roomNumber: string;
  guestName: string;
  checkInDate: string; // "DD/MM/YYYY HH:MM:SS"
  expectedCheckOutDate: string; // "DD/MM/YYYY HH:MM:SS"
  actualCheckOutDate?: string; // "DD/MM/YYYY HH:MM:SS" — hospedagem ativa, então normalmente ausente
  dailyCount: number;
  extrasCount: number;
  totalDiarias: number;
  totalConsumo: number;
  desconto: number;
  totalAdiantamento: number;
  outrosDebitos: number;
}

export interface TransferDebitRoomOption {
  number: string;
  guestName: string;
}

export interface TransferenciaDebitoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  sourceStay: TransferDebitStayInfo | null;
  destinationRoomOptions: TransferDebitRoomOption[];
  onTransferSuccess?: () => void;
}

function saldoAPagar(stay: Pick<TransferDebitStayInfo, "totalDiarias" | "totalConsumo" | "outrosDebitos" | "desconto" | "totalAdiantamento">) {
  return Math.max(0, stay.totalDiarias + stay.totalConsumo + stay.outrosDebitos - stay.desconto - stay.totalAdiantamento);
}

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export default function TransferenciaDebitoModal({
  isOpen,
  onClose,
  tenantId,
  sourceStay,
  destinationRoomOptions,
  onTransferSuccess,
}: TransferenciaDebitoModalProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const { operatorId, operatorName } = useOperator();

  const [destRoomNumber, setDestRoomNumber] = useState<string>("");
  const [destStay, setDestStay] = useState<TransferDebitStayInfo | null>(null);
  const [loadingDest, setLoadingDest] = useState(false);
  const [valorTransferirStr, setValorTransferirStr] = useState<string>("0,00");
  const [isSaving, setIsSaving] = useState(false);

  const origemSaldo = useMemo(() => (sourceStay ? saldoAPagar(sourceStay) : 0), [sourceStay]);
  const destinoSaldo = useMemo(() => (destStay ? saldoAPagar(destStay) : 0), [destStay]);

  // Reseta a seleção de destino e pré-preenche "Débito a transferir" com o saldo total da origem
  // sempre que o modal abre para uma nova hospedagem de origem.
  useEffect(() => {
    if (isOpen && sourceStay) {
      setDestRoomNumber("");
      setDestStay(null);
      setValorTransferirStr(saldoAPagar(sourceStay).toFixed(2).replace(".", ","));
    }
  }, [isOpen, sourceStay?.stayCheckinId]);

  // Busca os dados reais da hospedagem do quarto de destino escolhido no dropdown.
  useEffect(() => {
    if (!destRoomNumber) {
      setDestStay(null);
      return;
    }
    setLoadingDest(true);
    (async () => {
      try {
        const res = await fetch(`/api/stay/checkin?roomNumber=${destRoomNumber}&tenantId=${tenantId}`);
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Hospedagem ativa não encontrada para o quarto de destino.", "Erro ao Carregar Quarto Destino");
          setDestStay(null);
          return;
        }
        const s = data.stay;
        setDestStay({
          stayCheckinId: s.id,
          roomNumber: s.roomNumber,
          guestName: s.guest?.fullName || "",
          checkInDate: s.checkInDate,
          expectedCheckOutDate: s.expectedCheckOut,
          actualCheckOutDate: s.actualCheckOut || undefined,
          dailyCount: s.dailiesCount,
          extrasCount: s.extraDailiesCount,
          totalDiarias: s.totalDaily,
          totalConsumo: s.totalConsumption,
          desconto: s.discount,
          totalAdiantamento: s.totalAdvance,
          outrosDebitos: s.otherDebits,
        });
      } catch (err) {
        console.error("[TransferenciaDebitoModal] Erro ao buscar hospedagem do quarto destino:", err);
        toast.error("Não foi possível carregar os dados do quarto de destino.", "Erro ao Carregar Quarto Destino");
        setDestStay(null);
      } finally {
        setLoadingDest(false);
      }
    })();
  }, [destRoomNumber, tenantId]);

  if (!isOpen || !sourceStay) return null;

  const fmtDate = (v?: string) => {
    if (!v) return new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR");
    // Aceita tanto "DD/MM/YYYY HH:MM:SS" (já formatado pelo chamador) quanto ISO (vindo direto da API).
    if (v.includes("/")) return v;
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const inputYellow = theme.isDark
    ? "bg-slate-800 border-slate-700 text-yellow-300"
    : "bg-yellow-50 border-yellow-200 text-slate-900";

  const cardCls = `border rounded-lg p-3 space-y-3 ${theme.isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`;

  const renderStatsRow = (stay: TransferDebitStayInfo) => (
    <div className="flex flex-wrap items-center gap-4 text-[11px]">
      <div>
        <span className="block text-[10px] text-slate-500 font-semibold">Dt.Chegada</span>
        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmtDate(stay.checkInDate)}</span>
      </div>
      <div>
        <span className="block text-[10px] text-slate-500 font-semibold">Dt.Prevista Saída</span>
        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{fmtDate(stay.expectedCheckOutDate)}</span>
      </div>
      <div className="text-center">
        <span className="block text-[10px] text-slate-500 font-semibold">Diárias</span>
        <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 border border-yellow-400/40">
          {stay.dailyCount}
        </span>
      </div>
      <div>
        <span className="block text-[10px] text-slate-500 font-semibold">Dt. Saída</span>
        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmtDate(stay.actualCheckOutDate)}</span>
      </div>
      <div className="text-center">
        <span className="block text-[10px] text-red-500 font-bold uppercase">Extras</span>
        <span className="font-mono font-extrabold text-xs text-red-600 dark:text-red-400">{stay.extrasCount}</span>
      </div>
    </div>
  );

  const renderTotalsGrid = (stay: TransferDebitStayInfo) => (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase">Valor total diárias(R$)</label>
        <input type="text" readOnly value={fmtCurrency(stay.totalDiarias)} className={`w-full font-mono font-bold text-right p-1 rounded border ${inputYellow}`} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase">Total Consumo(R$)</label>
        <input type="text" readOnly value={fmtCurrency(stay.totalConsumo)} className={`w-full font-mono font-bold text-right p-1 rounded border ${inputYellow}`} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase">Desconto (R$)</label>
        <input type="text" readOnly value={fmtCurrency(stay.desconto)} className={`w-full font-mono font-bold text-right p-1 rounded border ${inputYellow}`} />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">Total Adiant. (R$)</label>
        <input type="text" readOnly value={fmtCurrency(stay.totalAdiantamento)} className={`w-full font-mono font-bold text-right p-1 rounded border ${inputYellow}`} />
      </div>
    </div>
  );

  const parseValorTransferir = () => {
    const clean = valorTransferirStr.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    return parseFloat(clean);
  };

  const handleTransfer = async () => {
    if (isSaving) return;

    if (!destStay) {
      toast.warning("Selecione o quarto de destino antes de transferir.", "Quarto Destino Obrigatório");
      return;
    }

    const valor = parseValorTransferir();
    if (isNaN(valor) || valor <= 0) {
      toast.warning("Informe um valor de transferência maior que zero.", "Valor Inválido");
      return;
    }
    if (valor > origemSaldo + 0.01) {
      toast.warning(
        `O valor a transferir (${fmtCurrency(valor)}) não pode ser maior que o débito atual do quarto ${sourceStay.roomNumber} (${fmtCurrency(origemSaldo)}).`,
        "Valor Maior que o Débito"
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/stay/transfer-debit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          operatorId,
          operatorName,
          fromStayCheckinId: sourceStay.stayCheckinId,
          toStayCheckinId: destStay.stayCheckinId,
          amount: valor,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha ao transferir débito.");

      toast.success(data.message || `Débito transferido do quarto ${sourceStay.roomNumber} para o quarto ${destStay.roomNumber}.`, "Transferência Concluída");
      onTransferSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível transferir o débito. Tente novamente.", "Erro na Transferência");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-3xl rounded-xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          theme.isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-[#F4F6F9] border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-[#184176] via-[#1E5296] to-[#0284C7] px-4 py-2.5 flex items-center justify-between text-white shadow-md select-none">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-sky-200" />
            <h2 className="font-bold text-sm tracking-wide">Transferência de Débito</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white" title="Fechar (Esc)">
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
              <div className="flex-1 min-w-[260px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Hóspede Principal</label>
                <input type="text" readOnly value={sourceStay.guestName} className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${inputYellow}`} />
              </div>
            </div>
            {renderStatsRow(sourceStay)}
            {renderTotalsGrid(sourceStay)}

            <div>
              <h4 className="font-extrabold text-xs text-blue-700 dark:text-blue-400">Débito a transferir (R$)</h4>
              <input
                type="text"
                value={valorTransferirStr}
                onChange={(e) => setValorTransferirStr(e.target.value)}
                className="w-full bg-yellow-300 dark:bg-yellow-400/90 text-red-600 font-extrabold text-xl p-2 rounded-lg text-right shadow-inner font-mono border-2 border-yellow-400 outline-none"
              />
            </div>
          </div>

          {/* QUARTO DESTINO */}
          <div className={cardCls}>
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-200 border-b pb-1">Quarto destino:</h3>
            <div className="flex items-center gap-3">
              <div className="w-28">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Quartos</label>
                <select
                  value={destRoomNumber}
                  onChange={(e) => setDestRoomNumber(e.target.value)}
                  className={`w-full font-bold p-1.5 rounded border outline-none ${inputYellow}`}
                >
                  <option value="">Selecione...</option>
                  {destinationRoomOptions.map((r) => (
                    <option key={r.number} value={r.number}>
                      {r.number} — {r.guestName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[260px]">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Nome do Hóspede Principal</label>
                <input
                  type="text"
                  readOnly
                  value={loadingDest ? "Carregando..." : destStay?.guestName || ""}
                  className={`w-full font-bold px-2 py-1 rounded border text-xs outline-none ${inputYellow}`}
                />
              </div>
            </div>

            {destStay ? (
              <>
                {renderStatsRow(destStay)}
                {renderTotalsGrid(destStay)}
                <div>
                  <h4 className="font-extrabold text-xs text-blue-700 dark:text-blue-400">Saldo a pagar (R$)</h4>
                  <div className="bg-yellow-300 dark:bg-yellow-400/90 text-red-600 font-extrabold text-xl p-2 rounded-lg text-right shadow-inner font-mono border-2 border-yellow-400">
                    {fmtCurrency(destinoSaldo)}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-slate-400 italic text-[11px] py-2">
                {loadingDest ? "Carregando dados do quarto destino..." : "Selecione um quarto de destino para ver os dados da hospedagem."}
              </p>
            )}
          </div>

          <button
            onClick={handleTransfer}
            disabled={isSaving || !destStay}
            title={isSaving ? "Transferindo... Aguarde" : "Transferir Débito"}
            className="w-full py-3 px-4 rounded-xl bg-[#00BCD4] hover:bg-cyan-600 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6 stroke-[3]" />}
            {isSaving ? "Transferindo... Aguarde" : "Transferir débito"}
          </button>
        </div>
      </div>
    </div>
  );
}
