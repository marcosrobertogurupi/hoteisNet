"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Check, Banknote } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, inputCls, labelCls, primaryBtn, successBtn, ghostBtn, money, FORMA_LABEL, type Atendimento } from "../_ui";

type Linha = { forma: string; valor: string; bandeira: string; nsu: string };

const FORMAS_PARCIAL = ["DINHEIRO", "DEBITO", "CREDITO", "PIX"];

export default function PagamentoModal({
  atendimento,
  modo,
  onClose,
  onDone,
}: {
  atendimento: Atendimento;
  modo: "PARCIAL" | "FECHAR";
  onClose: () => void;
  onDone: (a: Atendimento) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const isHospede = atendimento.tipoCliente === "HOSPEDE";
  const saldo = atendimento.saldo;
  const [linhas, setLinhas] = useState<Linha[]>(
    modo === "PARCIAL" || !isHospede ? [{ forma: "DINHEIRO", valor: saldo > 0 ? saldo.toFixed(2) : "", bandeira: "", nsu: "" }] : []
  );
  const [saving, setSaving] = useState(false);

  const somaPag = useMemo(() => linhas.reduce((a, l) => a + (Number(l.valor) || 0), 0), [linhas]);
  const troco = modo === "FECHAR" && !isHospede ? Math.max(0, somaPag - saldo) : 0;
  const roomAmount = modo === "FECHAR" && isHospede ? Math.max(0, saldo - somaPag) : 0;

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    const pagamentos = linhas
      .filter((l) => Number(l.valor) > 0)
      .map((l) => ({ forma: l.forma, valor: Number(l.valor), bandeira: l.bandeira || undefined, nsu: l.nsu || undefined }));

    if (modo === "PARCIAL") {
      if (pagamentos.length === 0) return toast.warning("Informe o valor do pagamento.");
      if (somaPag - 0.005 > saldo) return toast.warning(`O pagamento parcial não pode passar do saldo (${money(saldo)}).`);
    }
    if (modo === "FECHAR" && !isHospede && somaPag + 0.005 < saldo) {
      return toast.warning(`Pagamento insuficiente para o saldo de ${money(saldo)}.`);
    }

    setSaving(true);
    try {
      const url =
        modo === "PARCIAL"
          ? `/api/pdv/atendimentos/${atendimento.id}/pagamentos`
          : `/api/pdv/atendimentos/${atendimento.id}/fechar`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagamentos }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível registrar o pagamento.");
        return;
      }
      toast.success(modo === "PARCIAL" ? "Pagamento parcial registrado." : "Comanda fechada.");
      if (data.troco > 0) toast.info(`Troco: ${money(data.troco)}`);
      onDone(data.atendimento);
    } finally {
      setSaving(false);
    }
  };

  const title =
    modo === "PARCIAL"
      ? `Pagamento parcial — Comanda ${atendimento.comanda.number}`
      : `Fechar comanda ${atendimento.comanda.number}`;

  return (
    <Modal isDark={isDark} title={title} onClose={onClose}>
      <div className={`rounded-xl p-3 text-xs ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
        <div className="flex justify-between">
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Total da comanda</span>
          <span className="font-mono font-semibold">{money(atendimento.total)}</span>
        </div>
        {atendimento.pago > 0 && (
          <div className="flex justify-between">
            <span className={isDark ? "text-slate-400" : "text-slate-500"}>Já pago</span>
            <span className="font-mono">− {money(atendimento.pago)}</span>
          </div>
        )}
        <div className={`flex justify-between mt-1 pt-1 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <span className="font-semibold">Saldo</span>
          <span className="font-mono font-bold text-sky-500">{money(saldo)}</span>
        </div>
      </div>

      {modo === "FECHAR" && isHospede && (
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Hóspede <strong>{atendimento.hospedagem?.hospede}</strong> — quarto {atendimento.hospedagem?.quarto}. O que não for
          pago agora vai para a conta do quarto.
        </p>
      )}

      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls(isDark)}>Forma</label>
                <select value={l.forma} onChange={(e) => setLinha(i, { forma: e.target.value })} className={inputCls(isDark)}>
                  {FORMAS_PARCIAL.map((f) => (
                    <option key={f} value={f}>
                      {FORMA_LABEL[f]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls(isDark)}>Valor</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.valor}
                  onChange={(e) => setLinha(i, { valor: e.target.value })}
                  className={`${inputCls(isDark)} font-mono`}
                />
              </div>
            </div>
            {(l.forma === "DEBITO" || l.forma === "CREDITO") && (
              <input
                placeholder="Bandeira/NSU"
                value={l.bandeira}
                onChange={(e) => setLinha(i, { bandeira: e.target.value })}
                className={`${inputCls(isDark)} w-28`}
              />
            )}
            {linhas.length > 1 && (
              <button
                onClick={() => setLinhas((prev) => prev.filter((_, idx) => idx !== i))}
                className={`p-2 rounded-lg ${isDark ? "text-rose-400 hover:bg-slate-800" : "text-rose-600 hover:bg-slate-100"}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setLinhas((prev) => [...prev, { forma: "DINHEIRO", valor: "", bandeira: "", nsu: "" }])}
          className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? "text-sky-400" : "text-sky-600"}`}
        >
          <Plus className="w-3.5 h-3.5" /> Outra forma
        </button>
      </div>

      <div className={`rounded-xl p-3 text-xs space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
        <div className="flex justify-between">
          <span className={isDark ? "text-slate-400" : "text-slate-500"}>Informado</span>
          <span className="font-mono">{money(somaPag)}</span>
        </div>
        {troco > 0 && (
          <div className="flex justify-between text-amber-500 font-semibold">
            <span className="inline-flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" /> Troco
            </span>
            <span className="font-mono">{money(troco)}</span>
          </div>
        )}
        {modo === "FECHAR" && isHospede && (
          <div className="flex justify-between font-semibold">
            <span>Para a conta do quarto</span>
            <span className="font-mono">{money(roomAmount)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={onClose} className={ghostBtn(isDark)}>
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className={modo === "FECHAR" ? successBtn : primaryBtn}>
          <Check className="w-4 h-4" /> {modo === "PARCIAL" ? "Registrar pagamento" : "Fechar comanda"}
        </button>
      </div>
    </Modal>
  );
}
