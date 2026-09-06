"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Banknote } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, inputCls, labelCls, primaryBtn, successBtn, ghostBtn, money, type Atendimento } from "../_ui";

type Linha = { paymentMethodId: string; valor: string; bandeira: string; nsu: string };

interface FormaPagamento {
  id: string;
  description: string;
  pdvCategory: "DINHEIRO" | "CARTAO_DEBITO" | "CARTAO_CREDITO" | "PIX" | "OUTRO";
}

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

  // Formas de pagamento vêm do cadastro (Cadastros → Formas de Pagamento). Fase A: só as formas
  // "simples" (sem parcelamento, sem débito de saldo do hóspede, sempre soma no caixa) — as
  // demais ainda não são executadas pelo PDV.
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [formasLoaded, setFormasLoaded] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/cadastros/formas-pagamento");
        const data = await res.json();
        const lista: FormaPagamento[] = (data?.paymentMethods || [])
          .filter(
            (f: any) =>
              f.active !== false && !f.transferDebit && !f.installment && !f.debitGuestBalance && f.sumsToCashRegister !== false
          )
          .map((f: any) => ({ id: f.id, description: f.description, pdvCategory: f.pdvCategory || "OUTRO" }));
        setFormas(lista);
        const primeira = lista.find((f) => f.pdvCategory === "DINHEIRO")?.id || lista[0]?.id || "";
        if (primeira && (modo === "PARCIAL" || !isHospede)) {
          setLinhas([{ paymentMethodId: primeira, valor: saldo > 0 ? saldo.toFixed(2) : "", bandeira: "", nsu: "" }]);
        }
      } catch {
        toast.error("Não foi possível carregar as formas de pagamento.");
      } finally {
        setFormasLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catOf = (id: string) => formas.find((f) => f.id === id)?.pdvCategory;
  const primeiraForma = formas.find((f) => f.pdvCategory === "DINHEIRO")?.id || formas[0]?.id || "";

  const somaPag = useMemo(() => linhas.reduce((a, l) => a + (Number(l.valor) || 0), 0), [linhas]);
  const troco = modo === "FECHAR" && !isHospede ? Math.max(0, somaPag - saldo) : 0;
  const roomAmount = modo === "FECHAR" && isHospede ? Math.max(0, saldo - somaPag) : 0;

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    const pagamentos = linhas
      .filter((l) => Number(l.valor) > 0 && l.paymentMethodId)
      .map((l) => ({
        paymentMethodId: l.paymentMethodId,
        valor: Number(l.valor),
        bandeira: l.bandeira || undefined,
        nsu: l.nsu || undefined,
      }));

    if (modo === "PARCIAL") {
      if (pagamentos.length === 0) return toast.warning("Informe a forma e o valor do pagamento.");
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

  const semFormas = formasLoaded && formas.length === 0;

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

      {semFormas ? (
        <p className="text-xs text-amber-500">
          Nenhuma forma de pagamento disponível. Cadastre em Cadastros → Formas de Pagamento (a forma precisa somar no
          caixa e não ser de parcelamento/saldo do hóspede/transferência).
        </p>
      ) : (
        <div className="space-y-2">
          {linhas.map((l, i) => {
            const cat = catOf(l.paymentMethodId);
            const pedeBandeira = cat === "CARTAO_DEBITO" || cat === "CARTAO_CREDITO";
            return (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls(isDark)}>Forma</label>
                    <select
                      value={l.paymentMethodId}
                      onChange={(e) => setLinha(i, { paymentMethodId: e.target.value })}
                      className={inputCls(isDark)}
                    >
                      {formas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.description}
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
                {pedeBandeira && (
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
            );
          })}
          {primeiraForma && (
            <button
              onClick={() =>
                setLinhas((prev) => [...prev, { paymentMethodId: primeiraForma, valor: "", bandeira: "", nsu: "" }])
              }
              className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? "text-sky-400" : "text-sky-600"}`}
            >
              <Plus className="w-3.5 h-3.5" /> Outra forma
            </button>
          )}
        </div>
      )}

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
        <button onClick={submit} disabled={saving || semFormas} className={modo === "FECHAR" ? successBtn : primaryBtn}>
          <Check className="w-4 h-4" /> {modo === "PARCIAL" ? "Registrar pagamento" : "Fechar comanda"}
        </button>
      </div>
    </Modal>
  );
}
