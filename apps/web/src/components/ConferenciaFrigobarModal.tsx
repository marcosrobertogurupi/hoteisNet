"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Refrigerator, Loader2, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

interface KitItem {
  productId: string;
  productName: string;
  parQuantity: number;
  unitPrice: number;
}

export interface ConferenciaFrigobarModalProps {
  isOpen: boolean;
  stayCheckinId: string | null;
  roomNumber: string;
  operatorId?: string | null;
  operatorName?: string | null;
  // Fechar sem prosseguir (cancela o check-out).
  onClose: () => void;
  // Conferência resolvida (feita agora, já feita antes, ou não se aplica) — segue para o pagamento.
  onProceed: () => void;
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function ConferenciaFrigobarModal({
  isOpen,
  stayCheckinId,
  roomNumber,
  operatorId,
  operatorName,
  onClose,
  onProceed,
}: ConferenciaFrigobarModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KitItem[]>([]);
  const [found, setFound] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  // Valor de uma conferência de check-out anterior desta hospedagem que foi abandonada sem
  // concluir o check-out — será substituída por esta (o hóspede pode ter consumido mais).
  const [previousTotal, setPreviousTotal] = useState<number | null>(null);

  const proceed = useCallback(() => onProceed(), [onProceed]);

  useEffect(() => {
    if (!isOpen || !stayCheckinId) return;
    let cancelled = false;
    setLoading(true);
    setItems([]);
    fetch(`/api/stay/minibar-check?stayCheckinId=${encodeURIComponent(stayCheckinId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Só pula quando o recurso não se aplica (desligado, categoria sem kit). Se já houve uma
        // conferência de check-out antes (check-out abandonado), a tela AINDA aparece — ela será
        // refeita do zero, pois o hóspede pode ter consumido mais nesse meio-tempo.
        if (!data.success || !data.enabled) {
          proceed();
          return;
        }
        setItems(data.items || []);
        setPreviousTotal(data.alreadyDone && data.lastCheck ? Number(data.lastCheck.totalSold) : null);
        const initial: Record<string, number> = {};
        for (const it of data.items || []) initial[it.productId] = it.parQuantity;
        setFound(initial);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Não foi possível carregar a conferência do frigobar.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, stayCheckinId, proceed, toast]);

  const total = items.reduce((acc, it) => {
    const f = Number(found[it.productId] ?? it.parQuantity);
    return acc + Math.max(0, it.parQuantity - f) * it.unitPrice;
  }, 0);

  const handleConfirm = async () => {
    if (!stayCheckinId || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/stay/minibar-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stayCheckinId,
          operatorId,
          operatorName,
          items: items.map((it) => ({
            productId: it.productId,
            foundQty: Math.max(0, Math.min(it.parQuantity, Number(found[it.productId] ?? it.parQuantity))),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível registrar a conferência.");
        return;
      }
      if (data.totalSold > 0) {
        toast.success(`Consumo do frigobar lançado: ${money(data.totalSold)}.`, "Conferência registrada");
      } else {
        toast.success("Frigobar conferido — nenhum consumo.", "Conferência registrada");
      }
      proceed();
    } catch {
      toast.error("Erro de rede ao registrar a conferência do frigobar.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !stayCheckinId) return null;

  // Enquanto carrega/decide, um overlay discreto (pode resolver em "não se aplica" e sair sozinho).
  if (loading) {
    return (
      <div className="fixed inset-0 z-[68] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
        <div className={`rounded-2xl px-6 py-5 flex items-center gap-3 ${isDark ? "bg-[#0F172A] text-white" : "bg-white text-slate-900"}`}>
          <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
          <span className="text-sm font-semibold">Verificando frigobar...</span>
        </div>
      </div>
    );
  }

  const stepBtn = isDark
    ? "w-8 h-8 rounded-lg border border-slate-700 bg-slate-800 text-white font-bold"
    : "w-8 h-8 rounded-lg border border-slate-300 bg-slate-100 text-slate-800 font-bold";

  return (
    <div className="fixed inset-0 z-[68] flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-[#0F766E] to-[#14B8A6] px-4 py-3 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Refrigerator className="w-5 h-5" />
            <h2 className="font-bold text-sm">Conferência do frigobar — Quarto {roomNumber}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20" title="Cancelar check-out">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Confira o frigobar e informe quantas unidades <strong>ainda tem</strong> de cada item. A diferença em relação
            ao kit é lançada como consumo do quarto antes do pagamento.
          </p>

          {previousTotal !== null && (
            <p className={`text-xs rounded-lg px-3 py-2 border ${
              isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              Já houve uma conferência de check-out para esta hospedagem ({money(previousTotal)}), mas o check-out não
              foi concluído. Esta nova conferência <strong>substitui</strong> a anterior — confira o frigobar de novo.
            </p>
          )}

          <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            <table className="w-full text-left text-xs">
              <thead className={`uppercase tracking-wider ${isDark ? "bg-slate-950/80 text-slate-400" : "bg-slate-100 text-slate-600"}`}>
                <tr>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5 text-center">Kit</th>
                  <th className="px-3 py-2.5 text-center w-32">Encontrado</th>
                  <th className="px-3 py-2.5 text-right">Consumo</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {items.map((it) => {
                  const f = Number(found[it.productId] ?? it.parQuantity);
                  const sold = Math.max(0, it.parQuantity - f);
                  return (
                    <tr key={it.productId}>
                      <td className="px-3 py-2.5 font-semibold">
                        {it.productName}
                        <span className="block text-[10px] font-normal text-slate-400">{money(it.unitPrice)} un.</span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono">{it.parQuantity}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" className={stepBtn} onClick={() => setFound((p) => ({ ...p, [it.productId]: Math.max(0, f - 1) }))}>
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={it.parQuantity}
                            value={f}
                            onChange={(e) =>
                              setFound((p) => ({
                                ...p,
                                [it.productId]: Math.max(0, Math.min(it.parQuantity, Number(e.target.value) || 0)),
                              }))
                            }
                            className={`w-12 h-8 text-center rounded-lg border text-sm font-mono ${
                              isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                            }`}
                          />
                          <button type="button" className={stepBtn} onClick={() => setFound((p) => ({ ...p, [it.productId]: Math.min(it.parQuantity, f + 1) }))}>
                            +
                          </button>
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${sold > 0 ? "text-teal-500" : "text-slate-400"}`}>
                        {sold > 0 ? money(sold * it.unitPrice) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${isDark ? "bg-slate-900/60" : "bg-slate-50"}`}>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total do consumo</span>
            <span className={`text-lg font-extrabold font-mono ${total > 0 ? "text-teal-500" : "text-slate-400"}`}>{money(total)}</span>
          </div>
        </div>

        <div className={`px-4 py-3 border-t flex justify-end gap-2 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold border ${
              isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmar e seguir para pagamento
          </button>
        </div>
      </div>
    </div>
  );
}
