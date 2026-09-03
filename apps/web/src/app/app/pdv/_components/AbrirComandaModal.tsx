"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, inputCls, labelCls, primaryBtn, ghostBtn, type Atendimento } from "../_ui";

interface Opt {
  id: string;
  label: string;
}

export default function AbrirComandaModal({
  terminalId,
  onClose,
  onDone,
}: {
  terminalId: string;
  onClose: () => void;
  onDone: (a: Atendimento) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [comandas, setComandas] = useState<Opt[]>([]);
  const [pontos, setPontos] = useState<Opt[]>([]);
  const [mesas, setMesas] = useState<Opt[]>([]);
  const [hospedes, setHospedes] = useState<Array<{ id: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    comandaId: "",
    posLocationId: "",
    tableId: "",
    tipoCliente: "PASSANTE" as "PASSANTE" | "HOSPEDE",
    stayCheckinId: "",
    nomeCliente: "",
    telefoneCliente: "",
    cpfNota: "",
  });

  useEffect(() => {
    (async () => {
      const [cadastro, sp, h, ativos] = await Promise.all([
        fetch("/api/cadastros/comandas").then((r) => r.json()),
        fetch("/api/cadastros/pdv").then((r) => r.json()),
        fetch("/api/pdv/hospedes-inhouse").then((r) => r.json()),
        fetch("/api/pdv/atendimentos").then((r) => r.json()),
      ]);
      const emUso = new Set<string>(
        (ativos?.atendimentos || [])
          .filter((a: Atendimento) => a.status === "ABERTA" || a.status === "AGUARDANDO_FISCAL" || a.status === "FISCAL_REJEITADA")
          .map((a: Atendimento) => a.comanda.id)
      );
      if (cadastro?.success) {
        const items = cadastro.items || [];
        setComandas(
          items
            .filter((x: any) => x.type === "COMANDA_AVULSA" && x.active && !emUso.has(x.id))
            .map((x: any) => ({
              id: x.id,
              label: `Comanda ${x.number}${x.description && x.description !== x.number ? ` — ${x.description}` : ""}`,
            }))
        );
        setMesas(items.filter((x: any) => x.type === "MESA").map((x: any) => ({ id: x.id, label: `Mesa ${x.number}` })));
      }
      if (sp?.success) setPontos((sp.posLocations || []).filter((x: any) => x.active).map((x: any) => ({ id: x.id, label: x.name })));
      if (h?.success) setHospedes(h.hospedes.map((x: any) => ({ id: x.stayCheckinId, label: `${x.quarto} — ${x.hospede}` })));
    })();
  }, []);

  const submit = async () => {
    if (!form.comandaId) return toast.warning("Selecione a comanda.");
    if (!form.posLocationId) return toast.warning("Selecione o PDV (Restaurante, Bar da Piscina...).");
    if (form.tipoCliente === "HOSPEDE" && !form.stayCheckinId) return toast.warning("Selecione o hóspede.");

    setSaving(true);
    try {
      const res = await fetch("/api/pdv/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, terminalId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível abrir a comanda.");
        return;
      }
      toast.success("Comanda aberta.");
      onDone(data.atendimento);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isDark={isDark} title="Abrir comanda" onClose={onClose}>
      <div className="space-y-1.5">
        <label className={labelCls(isDark)}>
          Comanda <span className="text-rose-500">*</span>
        </label>
        <select value={form.comandaId} onChange={(e) => setForm({ ...form, comandaId: e.target.value })} className={inputCls(isDark)}>
          <option value="">Selecione o cartão…</option>
          {comandas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {comandas.length === 0 && (
          <p className="text-[11px] text-amber-500">Nenhuma comanda livre. Cadastre em Fiscal &amp; PDV → Comandas.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls(isDark)}>
            PDV <span className="text-rose-500">*</span>
          </label>
          <select value={form.posLocationId} onChange={(e) => setForm({ ...form, posLocationId: e.target.value })} className={inputCls(isDark)}>
            <option value="">Selecione…</option>
            {pontos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelCls(isDark)}>Mesa (opcional)</label>
          <select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })} className={inputCls(isDark)}>
            <option value="">—</option>
            {mesas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelCls(isDark)}>Cliente</label>
        <div className="flex gap-2">
          {(["PASSANTE", "HOSPEDE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setForm({ ...form, tipoCliente: t })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                form.tipoCliente === t
                  ? "bg-sky-600 text-white border-sky-600"
                  : isDark
                    ? "border-slate-700 text-slate-300"
                    : "border-slate-300 text-slate-600"
              }`}
            >
              {t === "PASSANTE" ? "Passante" : "Hóspede"}
            </button>
          ))}
        </div>
      </div>

      {form.tipoCliente === "HOSPEDE" ? (
        <div className="space-y-1.5">
          <label className={labelCls(isDark)}>
            Hospedagem <span className="text-rose-500">*</span>
          </label>
          <select value={form.stayCheckinId} onChange={(e) => setForm({ ...form, stayCheckinId: e.target.value })} className={inputCls(isDark)}>
            <option value="">Selecione o quarto/hóspede…</option>
            {hospedes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Nome</label>
            <input value={form.nomeCliente} onChange={(e) => setForm({ ...form, nomeCliente: e.target.value })} className={inputCls(isDark)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Telefone</label>
            <input value={form.telefoneCliente} onChange={(e) => setForm({ ...form, telefoneCliente: e.target.value })} className={inputCls(isDark)} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>CPF na nota</label>
            <input value={form.cpfNota} onChange={(e) => setForm({ ...form, cpfNota: e.target.value })} className={`${inputCls(isDark)} font-mono`} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button onClick={onClose} className={ghostBtn(isDark)}>
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className={primaryBtn}>
          <Check className="w-4 h-4" /> Abrir
        </button>
      </div>
    </Modal>
  );
}
