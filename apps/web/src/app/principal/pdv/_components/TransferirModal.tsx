"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRightLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, inputCls, labelCls, primaryBtn, ghostBtn, money, type Atendimento } from "../_ui";

export default function TransferirModal({
  origem,
  onClose,
  onDone,
}: {
  origem: Atendimento;
  onClose: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [destinos, setDestinos] = useState<Atendimento[]>([]);
  const [destinoId, setDestinoId] = useState("");
  const [modo, setModo] = useState<"COMANDA" | "ITENS">("COMANDA");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pdv/atendimentos")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setDestinos((d.atendimentos as Atendimento[]).filter((a) => a.status === "ABERTA" && a.id !== origem.id));
      });
  }, [origem.id]);

  const movingTotal =
    modo === "COMANDA"
      ? origem.total
      : origem.itens.filter((i) => itemIds.includes(i.id)).reduce((a, i) => a + i.total, 0);

  const submit = async () => {
    if (!destinoId) return toast.warning("Escolha a comanda de destino.");
    if (modo === "ITENS" && itemIds.length === 0) return toast.warning("Selecione os itens.");
    if (!adminEmail.trim() || !adminPassword.trim()) return toast.warning("Informe e-mail e senha do administrador.");

    setSaving(true);
    try {
      const res = await fetch(`/api/pdv/atendimentos/${origem.id}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinoSessionId: destinoId, modo, itemIds, adminEmail: adminEmail.trim(), adminPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível transferir.");
        return;
      }
      toast.success("Débito transferido.");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isDark={isDark} title={`Transferir débito — Comanda ${origem.comanda.number}`} onClose={onClose} wide>
      <div className="flex gap-2">
        {(["COMANDA", "ITENS"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
              modo === m ? "bg-sky-600 text-white border-sky-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
            }`}
          >
            {m === "COMANDA" ? "Comanda inteira" : "Itens selecionados"}
          </button>
        ))}
      </div>

      {modo === "ITENS" && (
        <div className={`rounded-xl border divide-y ${isDark ? "border-slate-800 divide-slate-800" : "border-slate-200 divide-slate-200"}`}>
          {origem.itens.map((it) => (
            <label key={it.id} className="flex items-center justify-between gap-3 p-2.5 text-xs cursor-pointer">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={itemIds.includes(it.id)}
                  onChange={(e) =>
                    setItemIds((prev) => (e.target.checked ? [...prev, it.id] : prev.filter((x) => x !== it.id)))
                  }
                />
                {it.quantidade}× {it.nome}
              </span>
              <span className="font-mono">{money(it.total)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelCls(isDark)}>Comanda de destino</label>
        <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className={inputCls(isDark)}>
          <option value="">Selecione…</option>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              Comanda {d.comanda.number}
              {d.nomeCliente ? ` — ${d.nomeCliente}` : d.hospedagem?.hospede ? ` — ${d.hospedagem.hospede}` : ""} ({money(d.total)})
            </option>
          ))}
        </select>
      </div>

      <div className={`rounded-xl p-3 text-xs flex justify-between ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
        <span className={isDark ? "text-slate-400" : "text-slate-500"}>Valor a transferir</span>
        <span className="font-mono font-bold text-sky-500">{money(movingTotal)}</span>
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-amber-500/30 bg-amber-500/5" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-[11px] font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <ShieldCheck className="w-3.5 h-3.5" /> Transferência exige autorização de administrador
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="email"
            placeholder="E-mail do admin"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className={inputCls(isDark)}
          />
          <input
            type="password"
            placeholder="Senha"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className={inputCls(isDark)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={onClose} className={ghostBtn(isDark)}>
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className={primaryBtn}>
          <ArrowRightLeft className="w-4 h-4" /> Transferir
        </button>
      </div>
    </Modal>
  );
}
