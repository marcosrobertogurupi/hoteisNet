"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, inputCls, labelCls, primaryBtn, ghostBtn } from "../_ui";

export default function CaixaMovimentoModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [tipo, setTipo] = useState<"SANGRIA" | "SUPRIMENTO">("SANGRIA");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!(Number(valor) > 0)) return toast.warning("Informe um valor maior que zero.");
    setSaving(true);
    try {
      const res = await fetch("/api/pdv/caixa/movimento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: Number(valor), motivo }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível lançar o movimento.");
        return;
      }
      toast.success(tipo === "SANGRIA" ? "Sangria registrada." : "Suprimento registrado.");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isDark={isDark} title="Movimento de caixa" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setTipo("SANGRIA")}
          className={`py-2.5 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-2 ${
            tipo === "SANGRIA" ? "bg-rose-600 text-white border-rose-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
          }`}
        >
          <ArrowUpCircle className="w-4 h-4" /> Sangria (retirada)
        </button>
        <button
          onClick={() => setTipo("SUPRIMENTO")}
          className={`py-2.5 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-2 ${
            tipo === "SUPRIMENTO" ? "bg-emerald-600 text-white border-emerald-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
          }`}
        >
          <ArrowDownCircle className="w-4 h-4" /> Suprimento (reforço)
        </button>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls(isDark)}>Valor</label>
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={`${inputCls(isDark)} font-mono`}
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls(isDark)}>Motivo</label>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={tipo === "SANGRIA" ? "ex.: envio para o cofre" : "ex.: troco do turno"}
          className={inputCls(isDark)}
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={onClose} className={ghostBtn(isDark)}>
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className={primaryBtn}>
          <Check className="w-4 h-4" /> Registrar
        </button>
      </div>
    </Modal>
  );
}
