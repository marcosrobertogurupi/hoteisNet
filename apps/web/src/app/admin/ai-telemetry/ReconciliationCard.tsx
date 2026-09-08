"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);
const usd = (v: number) => `US$ ${v.toFixed(2)}`;

interface Row {
  month: string;
  computedUsd: number;
  tokens: number;
  requests: number;
  invoiceUsd: number | null;
  driftUsd: number | null;
  driftPct: number | null;
  enteredByName: string | null;
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export default function ReconciliationCard({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingMonth, setSavingMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/admin/ai-cost-reconciliation").then((r) => r.json());
      if (d?.success) {
        setRows(d.rows);
        setDrafts(Object.fromEntries(d.rows.map((r: Row) => [r.month, r.invoiceUsd == null ? "" : String(r.invoiceUsd)])));
      }
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (month: string) => {
    setSavingMonth(month);
    try {
      const res = await fetch("/api/admin/ai-cost-reconciliation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth: month, providerInvoiceUsd: drafts[month] === "" ? null : Number(drafts[month]) }),
      });
      const j = await res.json();
      if (j?.success) {
        toast.success("Reconciliação salva.");
        await load();
      } else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingMonth(null);
    }
  };

  const driftCls = (pct: number | null) => {
    if (pct == null) return "text-slate-400";
    const a = Math.abs(pct);
    if (a <= 5) return "text-emerald-700";
    if (a <= 15) return "text-amber-700";
    return "text-rose-700 font-semibold";
  };

  return (
    <div className={`${c.tableCard} overflow-hidden`}>
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <Scale className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Reconciliação com a fatura do Google</h3>
      </div>
      <p className="px-4 pt-3 text-[11px] text-slate-500">
        Digite o total real da fatura do Google (Cloud Billing / AI Studio) de cada mês. Um desvio grande entre o custo
        que o sistema calcula e a fatura real indica que os preços em <b>Modelos de IA</b> ou a contagem de tokens
        precisam de ajuste.
      </p>
      {loading ? (
        <div className={`p-8 text-center ${c.empty}`}>
          <Loader2 className="w-5 h-5 animate-spin inline" />
        </div>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-4 py-2.5">Mês</th>
                <th className="px-4 py-2.5 text-right">Custo calculado</th>
                <th className="px-4 py-2.5 text-right">Fatura real (US$)</th>
                <th className="px-4 py-2.5 text-right">Desvio US$</th>
                <th className="px-4 py-2.5 text-right">Desvio %</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="px-4 py-2.5 text-slate-800 font-medium capitalize">{monthLabel(r.month)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700">{usd(r.computedUsd)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="—"
                          value={drafts[r.month] ?? ""}
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.month]: e.target.value }))}
                          className={`${c.field} !py-1 w-24 text-right`}
                        />
                        <button
                          onClick={() => save(r.month)}
                          disabled={savingMonth === r.month}
                          className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold disabled:opacity-50"
                        >
                          ok
                        </button>
                      </span>
                    ) : (
                      <span className="font-mono text-slate-700">{r.invoiceUsd == null ? "—" : usd(r.invoiceUsd)}</span>
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${driftCls(r.driftPct)}`}>
                    {r.driftUsd == null ? "—" : `${r.driftUsd >= 0 ? "+" : ""}${r.driftUsd.toFixed(2)}`}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${driftCls(r.driftPct)}`}>
                    {r.driftPct == null ? "—" : `${r.driftPct >= 0 ? "+" : ""}${r.driftPct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
