"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, ChevronRight, RefreshCw, Warehouse, Store, Clock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cadastroUI } from "../../cadastros/_ui";

interface CountRow {
  id: string;
  alvo: string;
  isGeneral: boolean;
  status: "OPEN" | "DONE" | "RECONCILED" | "CANCELLED";
  conferente: string;
  totalItens: number;
  criadaEm: string;
  finalizadaEm: string | null;
  confrontadaEm: string | null;
  confrontadaPor: string | null;
}

const STATUS: Record<CountRow["status"], { text: string; cls: (d: boolean) => string }> = {
  DONE: { text: "Aguardando confronto", cls: () => "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  OPEN: { text: "Em contagem", cls: () => "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  RECONCILED: { text: "Confrontada", cls: () => "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  CANCELLED: { text: "Cancelada", cls: () => "bg-slate-500/15 text-slate-500 border-slate-500/30" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ContagensListPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const router = useRouter();

  const [counts, setCounts] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock/counts");
      const data = await res.json();
      if (data.success) setCounts(data.counts || []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pendentes = counts.filter((x) => x.status === "DONE");
  const emContagem = counts.filter((x) => x.status === "OPEN");
  const historico = counts.filter((x) => x.status === "RECONCILED" || x.status === "CANCELLED");

  const Card = ({ x }: { x: CountRow }) => {
    const actionable = x.status === "DONE";
    return (
      <button
        onClick={() => router.push(`/app/stock/contagens/${x.id}`)}
        className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition ${
          isDark ? "bg-slate-900/60 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {x.isGeneral ? (
            <Warehouse className="w-5 h-5 text-sky-500 shrink-0" />
          ) : (
            <Store className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-bold truncate ${c.strong}`}>{x.alvo}</p>
            <p className={`text-[11px] ${c.muted}`}>
              {x.totalItens} item(ns) · {x.conferente}
              {x.status === "DONE" && ` · finalizada ${fmt(x.finalizadaEm)}`}
              {x.status === "RECONCILED" && ` · confrontada por ${x.confrontadaPor || "—"} em ${fmt(x.confrontadaEm)}`}
            </p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS[x.status].cls(isDark)}`}>
              {STATUS[x.status].text}
            </span>
          </div>
        </div>
        {actionable && <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/app/stock" className={c.backLink}>
          <ArrowLeft className="w-4 h-4" /> Voltar para o Estoque
        </Link>
        <button onClick={load} disabled={loading} className={`text-xs font-semibold flex items-center gap-1.5 ${c.muted}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl">
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Conferências de contagem</h1>
            <p className={c.subtitle}>
              Confronte o que foi contado no app de celular com o saldo do sistema e aplique os ajustes.
            </p>
          </div>
        </div>
      </div>

      {pendentes.length > 0 && (
        <section className="space-y-2.5">
          <h2 className={`text-xs font-mono uppercase tracking-wider ${c.muted}`}>Aguardando confronto</h2>
          {pendentes.map((x) => (
            <Card key={x.id} x={x} />
          ))}
        </section>
      )}

      {emContagem.length > 0 && (
        <section className="space-y-2.5">
          <h2 className={`text-xs font-mono uppercase tracking-wider ${c.muted}`}>Em contagem no celular</h2>
          {emContagem.map((x) => (
            <Card key={x.id} x={x} />
          ))}
        </section>
      )}

      {!loading && counts.length === 0 && (
        <div className={`text-center py-16 rounded-2xl border border-dashed ${isDark ? "border-slate-800" : "border-slate-300"}`}>
          <ClipboardCheck className={`w-10 h-10 mx-auto mb-3 ${c.empty}`} />
          <p className={`text-sm ${c.muted}`}>Nenhuma contagem ainda.</p>
          <p className={`text-xs ${c.empty}`}>As contagens feitas no app de celular aparecem aqui.</p>
        </div>
      )}

      {historico.length > 0 && (
        <section className="space-y-2.5">
          <h2 className={`text-xs font-mono uppercase tracking-wider ${c.muted} flex items-center gap-1.5`}>
            <Clock className="w-3.5 h-3.5" /> Histórico
          </h2>
          {historico.map((x) => (
            <Card key={x.id} x={x} />
          ))}
        </section>
      )}
    </div>
  );
}
