"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Filter, ChevronDown, ChevronRight, Printer } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

// Relatórios › Autorizações — trilha de auditoria dos eventos críticos (desconto acima do limite,
// anulação de lançamento no caixa, cortesia de chegada antecipada, comandas do PDV…): quem pediu,
// quem autorizou ou recusou, por qual canal e quando. Só leitura. Ver lib/criticalAuth.ts.

interface Linha {
  id: string;
  criadaEm: string;
  evento: string;
  status: string;
  resumo: string;
  detalhes: [string, string][];
  justificativa: string | null;
  pedidoPor: string;
  terminal: string | null;
  decididoPor: string | null;
  canal: string | null;
  observacao: string | null;
  decididaEm: string | null;
  executadaEm: string | null;
}

const EVENTOS: { value: string; label: string }[] = [
  { value: "", label: "Todos os eventos" },
  { value: "DESCONTO_ACIMA_LIMITE", label: "Desconto acima do limite" },
  { value: "ANULAR_LANCAMENTO_CAIXA", label: "Anulação de lançamento no caixa" },
  { value: "CORTESIA_CHEGADA_ANTECIPADA", label: "Cortesia / taxa reduzida na chegada antecipada" },
  { value: "CANCELAR_COMANDA", label: "Cancelamento de comanda" },
  { value: "REABRIR_COMANDA", label: "Reabertura de comanda" },
  { value: "TRANSFERIR_COMANDA", label: "Transferência entre comandas" },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  EXECUTADA: { label: "Autorizada", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  APROVADA: { label: "Aprovada (não usada)", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  PENDENTE: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  RECUSADA: { label: "Recusada", cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
  CANCELADA: { label: "Cancelada pelo operador", cls: "bg-slate-500/15 text-slate-500" },
  EXPIRADA: { label: "Expirou", cls: "bg-slate-500/15 text-slate-500" },
  NAO_EXECUTADA: { label: "Não concluída", cls: "bg-slate-500/15 text-slate-500" },
};

const CANAL: Record<string, string> = {
  LOCAL: "Senha no terminal",
  LINK: "Link pelo WhatsApp",
  PROPRIO: "Operador é autorizador",
};

function hoje(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function dataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}

export default function AutorizacoesReportPage() {
  const { theme } = useTheme();
  const [de, setDe] = useState(hoje(-30));
  const [ate, setAte] = useState(hoje());
  const [evento, setEvento] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ de, ate });
      if (evento) params.set("evento", evento);
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const d = await fetch(`/api/autorizacoes?${params}`).then((r) => r.json());
      if (!d.success) {
        setError(d.error || "Erro ao consultar.");
        setLinhas([]);
        return;
      }
      setLinhas(d.autorizacoes);
      setTruncado(!!d.truncado);
    } catch {
      setError("Erro de rede ao consultar as autorizações.");
    } finally {
      setLoading(false);
    }
  }, [de, ate, evento, status, q]);

  useEffect(() => {
    buscar();
    // Carga inicial com os filtros padrão; depois só ao clicar em Pesquisar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = `w-full rounded-xl border px-3 py-2 text-xs outline-none ${
    theme.isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
  }`;
  const label = `block text-[10px] font-semibold mb-1 ${theme.textMuted}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/principal/relatorios" className={`p-2 rounded-lg border transition-colors ${theme.bgCard}`} title="Voltar aos Relatórios">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" style={{ color: theme.primaryColor }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Autorizações</h1>
          </div>
        </div>
        <button onClick={() => window.print()} className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${theme.bgCard}`}>
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
      </div>

      <p className={`text-xs ${theme.textMuted}`}>
        Quem pediu, quem autorizou ou recusou, por qual canal e quando — desconto acima do limite, anulação de lançamento no caixa,
        cortesia de chegada antecipada e ações nas comandas do PDV.
      </p>

      <div className={`p-4 rounded-2xl border grid grid-cols-2 md:grid-cols-6 gap-3 items-end print:hidden ${theme.bgCard}`}>
        <div>
          <label htmlFor="aut-de" className={label}>De</label>
          <input id="aut-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="aut-ate" className={label}>Até</label>
          <input id="aut-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={field} />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label htmlFor="aut-evento" className={label}>Evento</label>
          <select id="aut-evento" value={evento} onChange={(e) => setEvento(e.target.value)} className={field}>
            {EVENTOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aut-status" className={label}>Situação</label>
          <select id="aut-status" value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
            <option value="">Todas</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="aut-q" className={label}>Buscar</label>
          <input
            id="aut-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Operador, autorizador…"
            className={field}
          />
        </div>
        <button
          onClick={buscar}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Buscando..." : "Pesquisar"}
        </button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}
      {truncado && (
        <p className={`text-[11px] ${theme.textMuted}`}>Mostrando as 200 mais recentes — reduza o período para ver o restante.</p>
      )}

      {!error && (
      <div className={`rounded-2xl border overflow-hidden ${theme.bgCard}`}>
        {loading && linhas.length === 0 ? (
          <p className="p-6 text-center text-sm opacity-60">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="p-6 text-center text-sm opacity-60">Nenhuma autorização no período.</p>
        ) : (
          <div className={`divide-y ${theme.isDark ? "divide-slate-800" : "divide-slate-200"}`}>
            {linhas.map((l) => {
              const st = STATUS[l.status] || { label: l.status, cls: "bg-slate-500/15 text-slate-500" };
              const open = aberta === l.id;
              return (
                <div key={l.id} className="p-3 text-xs break-inside-avoid">
                  <button
                    onClick={() => setAberta(open ? null : l.id)}
                    className="w-full text-left flex items-start gap-2"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 print:hidden" /> : <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 print:hidden" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-mono ${theme.textMuted}`}>{dataHora(l.criadaEm)}</span>
                        <span className="font-bold">{l.evento}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="mt-0.5">{l.resumo}</p>
                      <p className={`mt-0.5 ${theme.textMuted}`}>
                        Pedido por <strong>{l.pedidoPor}</strong>
                        {l.terminal ? ` (${l.terminal})` : ""}
                        {l.decididoPor && (
                          <>
                            {" · "}
                            {l.status === "RECUSADA" ? "recusado" : "autorizado"} por <strong>{l.decididoPor}</strong>
                            {l.canal ? ` — ${CANAL[l.canal] || l.canal}` : ""}
                          </>
                        )}
                      </p>
                    </div>
                  </button>
                  {open && (
                    <div className={`mt-2 ml-6 grid md:grid-cols-2 gap-3 rounded-xl border p-3 ${theme.isDark ? "border-slate-800" : "border-slate-200"}`}>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        {l.detalhes.map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className={theme.textMuted}>{k}</dt>
                            <dd className="font-semibold text-right">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className={theme.textMuted}>Justificativa</dt>
                        <dd className="text-right">{l.justificativa || "—"}</dd>
                        <dt className={theme.textMuted}>Observação do autorizador</dt>
                        <dd className="text-right">{l.observacao || "—"}</dd>
                        <dt className={theme.textMuted}>Decidido em</dt>
                        <dd className="text-right">{dataHora(l.decididaEm)}</dd>
                        <dt className={theme.textMuted}>Executado em</dt>
                        <dd className="text-right">{dataHora(l.executadaEm)}</dd>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
