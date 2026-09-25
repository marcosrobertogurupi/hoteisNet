"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wrench, RefreshCw, Camera, Clock, AlertTriangle, BarChart3, Columns3 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { usePolling } from "@/lib/usePolling";
import { useToast } from "@/context/ToastContext";
import OsManutencaoModal from "@/components/manutencao/OsManutencaoModal";
import {
  MAINTENANCE_STAGE_LABEL,
  formatMaintenanceDateTime,
  formatMaintenanceDuration,
  type MaintenanceStageValue,
} from "@/lib/maintenanceShared";

// Painel de Manutenção: o funil das OS (Entrada / Avaliando / Aguardando / Resolvidas) e o
// relatório de tempo inativo dos quartos. O funil se atualiza sozinho a cada 3 s, como os mapas
// (exceção à regra "polling só nos mapas", pedida pelo usuário em 25/09/2026): pausa com o "Ver OS"
// aberto, na aba Tempo inativo e com a aba do navegador escondida (usePolling), e o servidor
// responde 304 quando nenhuma OS mudou (ETag em /api/manutencao/os).

interface TicketRow {
  id: string;
  number: number;
  stage: MaintenanceStageValue;
  description: string;
  openedAt: string;
  expectedReleaseAt: string | null;
  resolvedAt: string | null;
  downtimeMinutes: number | null;
  roomNumber: string;
  problemType: string;
  employeeName: string;
  waitReason: string | null;
  photoCount: number;
}

interface GroupRow {
  label: string;
  count: number;
  resolved: number;
  totalMinutes: number;
  avgResolvedMinutes: number | null;
}

interface Report {
  truncated: boolean;
  totals: {
    opened: number;
    resolved: number;
    stillOpen: number;
    cancelled: number;
    roomsAffected: number;
    totalMinutes: number;
    avgResolvedMinutes: number | null;
  };
  byRoom: GroupRow[];
  byProblemType: GroupRow[];
  byEmployee: GroupRow[];
  byStage: { stage: "OPEN" | "EVALUATING" | "WAITING"; totalMinutes: number; avgMinutes: number | null }[];
  waitByReason: { label: string; totalMinutes: number; avgMinutes: number; count: number }[];
  tickets: {
    id: string;
    number: number;
    stage: MaintenanceStageValue;
    roomNumber: string;
    problemType: string;
    description: string;
    employeeName: string;
    openedAt: string;
    resolvedAt: string | null;
    minutes: number | null;
  }[];
}

const COLUMNS: { stage: MaintenanceStageValue; hint: string }[] = [
  { stage: "OPEN", hint: "aguardando o colaborador começar" },
  { stage: "EVALUATING", hint: "colaborador no quarto" },
  { stage: "WAITING", hint: "peça, profissional, orçamento…" },
  { stage: "RESOLVED", hint: "últimos 7 dias" },
];

const minutesLabel = (m: number | null | undefined) => (m === null || m === undefined ? "—" : formatMaintenanceDuration(m * 60000));

function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export default function ManutencaoPainelPage() {
  const { theme } = useTheme();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const isDark = theme.isDark;

  const [tab, setTab] = useState<"funil" | "relatorio">("funil");
  const [openTickets, setOpenTickets] = useState<TicketRow[]>([]);
  const [resolved, setResolved] = useState<TicketRow[]>([]);
  const [loadingFunnel, setLoadingFunnel] = useState(false);
  const [osTicketId, setOsTicketId] = useState<string | null>(null);

  const [de, setDe] = useState(() => ymd(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
  const [ate, setAte] = useState(() => ymd(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // manual = clique no Atualizar (mostra o giro e avisa erro). No tique automático do polling a
  // falha é silenciosa (tenta de novo em 3 s) e o estado só troca quando o conteúdo mudou — sem
  // repintar o funil a cada tique.
  const loadFunnel = useCallback(async (manual = false) => {
    if (manual) setLoadingFunnel(true);
    try {
      const [a, r] = await Promise.all([
        fetch("/api/manutencao/os?situacao=abertas").then((x) => x.json()),
        fetch("/api/manutencao/os?situacao=resolvidas&dias=7").then((x) => x.json()),
      ]);
      if (!a.success || !r.success) throw new Error(a.error || r.error);
      setOpenTickets((prev) => (JSON.stringify(prev) === JSON.stringify(a.tickets) ? prev : a.tickets));
      setResolved((prev) => (JSON.stringify(prev) === JSON.stringify(r.tickets) ? prev : r.tickets));
    } catch {
      if (manual) toastRef.current.error("Não foi possível carregar as ordens de serviço.", "Manutenção");
    } finally {
      if (manual) setLoadingFunnel(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/manutencao/relatorio?de=${de}&ate=${ate}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setReport(data);
    } catch (e: any) {
      toastRef.current.error(e?.message || "Não foi possível montar o relatório.", "Manutenção");
    } finally {
      setLoadingReport(false);
    }
  }, [de, ate]);

  useEffect(() => {
    if (tab === "relatorio") loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Funil ao vivo, como os mapas — pausado com o "Ver OS" aberto e fora da aba Funil.
  usePolling(loadFunnel, 3000, { paused: tab !== "funil" || !!osTicketId });

  // "Parado há …" é calculado na hora do render; com o polling respondendo 304 nada re-renderiza,
  // então um tique por minuto mantém o tempo em dia.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    if (tab !== "funil") return;
    const t = setInterval(() => setMinuteTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, [tab]);

  const card = isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const strong = isDark ? "text-white" : "text-slate-900";
  const barColor = isDark ? "#F43F5E" : "#E11D48";
  const field = `rounded-xl border px-3 py-2 text-xs outline-none ${
    isDark ? "bg-slate-950 border-slate-800 text-white focus:border-rose-500" : "bg-white border-slate-300 text-slate-900 focus:border-rose-500"
  }`;
  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 ${
      active ? "bg-rose-700 border-rose-700 text-white" : isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
    }`;

  const columnTickets = (stage: MaintenanceStageValue) =>
    stage === "RESOLVED" ? resolved : openTickets.filter((t) => t.stage === stage);

  const setPreset = (days: number) => {
    setDe(ymd(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)));
    setAte(ymd(new Date()));
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border ${card}`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${isDark ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"}`}>
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${strong}`}>Manutenção de Quartos</h1>
              <p className={`text-xs ${muted}`}>
                Ordens de serviço em andamento e o tempo que cada quarto ficou fora de venda. Para abrir uma OS, use o Mapa de Quartos
                (Alterar Situação → Abrir OS de manutenção).
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className={tabBtn(tab === "funil")} onClick={() => setTab("funil")}>
              <Columns3 className="w-4 h-4" /> Funil
            </button>
            <button className={tabBtn(tab === "relatorio")} onClick={() => setTab("relatorio")}>
              <BarChart3 className="w-4 h-4" /> Tempo inativo
            </button>
          </div>
        </div>

        {tab === "funil" ? (
          <>
            <div className="flex items-center justify-between">
              <p className={`text-xs ${muted}`}>
                {openTickets.length} OS aberta(s) · {resolved.length} resolvida(s) nos últimos 7 dias
              </p>
              <button onClick={() => loadFunnel(true)} disabled={loadingFunnel} className={`text-xs font-semibold flex items-center gap-1.5 ${isDark ? "text-rose-400" : "text-rose-600"}`}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFunnel ? "animate-spin" : ""}`} /> Atualizar
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {COLUMNS.map((col, i) => {
                const list = columnTickets(col.stage);
                return (
                  <div key={col.stage} className={`rounded-2xl border p-3 space-y-3 min-h-[200px] ${isDark ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <h2 className={`text-sm font-bold ${strong}`}>
                          {i + 1}. {col.stage === "RESOLVED" ? "Resolvidas" : MAINTENANCE_STAGE_LABEL[col.stage]}
                        </h2>
                        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-slate-800 text-slate-200" : "bg-white border border-slate-200 text-slate-700"}`}>
                          {list.length}
                        </span>
                      </div>
                      <p className={`text-[10px] ${muted}`}>{col.hint}</p>
                    </div>
                    {list.length === 0 && <p className={`text-xs text-center py-6 ${muted}`}>Nenhuma OS</p>}
                    {list.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setOsTicketId(t.id)}
                        className={`w-full text-left rounded-xl border p-3 space-y-1.5 transition hover:border-rose-500/60 ${card}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-sm px-2 py-0.5 rounded-lg bg-rose-700 text-white">{t.roomNumber}</span>
                          <span className={`text-[10px] font-mono ${muted}`}>OS nº {t.number}</span>
                        </div>
                        <p className={`text-xs font-bold ${strong}`}>{t.problemType}</p>
                        <p className={`text-xs line-clamp-2 ${muted}`}>{t.description}</p>
                        {t.stage === "WAITING" && t.waitReason && (
                          <p className={`text-[11px] font-semibold ${isDark ? "text-sky-300" : "text-sky-700"}`}>{t.waitReason}</p>
                        )}
                        <div className={`flex items-center justify-between gap-2 text-[10px] ${muted}`}>
                          <span>{t.employeeName}</span>
                          <span className="flex items-center gap-1">
                            {t.photoCount > 0 && (
                              <>
                                <Camera className="w-3 h-3" /> {t.photoCount}
                              </>
                            )}
                            <Clock className="w-3 h-3 ml-1" />
                            {t.stage === "RESOLVED"
                              ? minutesLabel(t.downtimeMinutes)
                              : formatMaintenanceDuration(Date.now() - new Date(t.openedAt).getTime())}
                          </span>
                        </div>
                        {t.stage !== "RESOLVED" && t.expectedReleaseAt && (
                          <p className={`text-[10px] ${muted}`}>Previsão: {formatMaintenanceDateTime(t.expectedReleaseAt)}</p>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className={`flex flex-wrap items-end gap-3 p-4 rounded-2xl border ${card}`}>
              <div>
                <label className={`block text-[10px] font-semibold uppercase mb-1 ${muted}`}>De</label>
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={field} />
              </div>
              <div>
                <label className={`block text-[10px] font-semibold uppercase mb-1 ${muted}`}>Até</label>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={field} />
              </div>
              {[7, 30, 90].map((d) => (
                <button key={d} onClick={() => setPreset(d)} className={`${field} font-semibold`}>
                  {d} dias
                </button>
              ))}
              <button onClick={loadReport} disabled={loadingReport} className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? "animate-spin" : ""}`} /> Gerar
              </button>
              <p className={`text-[10px] w-full ${muted}`}>
                OS com entrada em manutenção no período. OS canceladas não contam no tempo inativo. Para OS ainda abertas, conta o tempo até agora.
              </p>
            </div>

            {report && (
              <>
                {report.truncated && (
                  <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Período com muitas OS — mostrando as 2000 mais recentes. Diminua o período.
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <StatTile label="OS no período" value={String(report.totals.opened)} sub={report.totals.cancelled ? `+ ${report.totals.cancelled} cancelada(s)` : undefined} card={card} strong={strong} muted={muted} />
                  <StatTile label="Resolvidas" value={String(report.totals.resolved)} card={card} strong={strong} muted={muted} />
                  <StatTile label="Ainda abertas" value={String(report.totals.stillOpen)} card={card} strong={strong} muted={muted} />
                  <StatTile label="Quartos afetados" value={String(report.totals.roomsAffected)} card={card} strong={strong} muted={muted} />
                  <StatTile label="Tempo inativo total" value={minutesLabel(report.totals.totalMinutes)} card={card} strong={strong} muted={muted} />
                  <StatTile label="Tempo médio até resolver" value={minutesLabel(report.totals.avgResolvedMinutes)} card={card} strong={strong} muted={muted} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <BarList
                    title="Quartos que mais ficaram parados"
                    rows={report.byRoom.slice(0, 10).map((r) => ({ label: `Quarto ${r.label}`, minutes: r.totalMinutes, sub: `${r.count} OS` }))}
                    card={card} strong={strong} muted={muted} barColor={barColor} isDark={isDark}
                  />
                  <BarList
                    title="Tempo inativo por tipo de problema"
                    rows={report.byProblemType.map((r) => ({ label: r.label, minutes: r.totalMinutes, sub: `${r.count} OS · média ${minutesLabel(r.avgResolvedMinutes)}` }))}
                    card={card} strong={strong} muted={muted} barColor={barColor} isDark={isDark}
                  />
                  <BarList
                    title="Tempo médio em cada etapa"
                    rows={report.byStage.map((s) => ({ label: MAINTENANCE_STAGE_LABEL[s.stage], minutes: s.avgMinutes ?? 0, sub: `total ${minutesLabel(s.totalMinutes)}` }))}
                    card={card} strong={strong} muted={muted} barColor={barColor} isDark={isDark}
                  />
                  <BarList
                    title="Tempo aguardando, por motivo"
                    rows={report.waitByReason.map((w) => ({ label: w.label, minutes: w.totalMinutes, sub: `${w.count}x · média ${minutesLabel(w.avgMinutes)}` }))}
                    card={card} strong={strong} muted={muted} barColor={barColor} isDark={isDark}
                    empty="Nenhuma OS ficou aguardando no período."
                  />
                </div>

                <div className={`rounded-2xl border overflow-x-auto ${card}`}>
                  <h3 className={`px-4 pt-4 text-sm font-bold ${strong}`}>Por colaborador</h3>
                  <table className="w-full text-xs mt-2">
                    <thead className={muted}>
                      <tr className="text-left">
                        <th className="px-4 py-2">Colaborador</th>
                        <th className="px-4 py-2 text-right">OS</th>
                        <th className="px-4 py-2 text-right">Resolvidas</th>
                        <th className="px-4 py-2 text-right">Tempo médio até resolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byEmployee.map((e) => (
                        <tr key={e.label} className={`border-t ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                          <td className={`px-4 py-2 font-semibold ${strong}`}>{e.label}</td>
                          <td className="px-4 py-2 text-right font-mono">{e.count}</td>
                          <td className="px-4 py-2 text-right font-mono">{e.resolved}</td>
                          <td className="px-4 py-2 text-right font-mono">{minutesLabel(e.avgResolvedMinutes)}</td>
                        </tr>
                      ))}
                      {report.byEmployee.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`px-4 py-6 text-center ${muted}`}>Nenhuma OS no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={`rounded-2xl border overflow-x-auto ${card}`}>
                  <h3 className={`px-4 pt-4 text-sm font-bold ${strong}`}>Todas as OS do período</h3>
                  <table className="w-full text-xs mt-2">
                    <thead className={muted}>
                      <tr className="text-left">
                        <th className="px-4 py-2">OS</th>
                        <th className="px-4 py-2">Quarto</th>
                        <th className="px-4 py-2">Problema</th>
                        <th className="px-4 py-2">Colaborador</th>
                        <th className="px-4 py-2">Entrada</th>
                        <th className="px-4 py-2">Retorno</th>
                        <th className="px-4 py-2 text-right">Tempo inativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tickets.map((t) => (
                        <tr
                          key={t.id}
                          onClick={() => setOsTicketId(t.id)}
                          className={`border-t cursor-pointer ${isDark ? "border-slate-800 hover:bg-slate-800/40" : "border-slate-200 hover:bg-slate-50"}`}
                        >
                          <td className="px-4 py-2 font-mono">{t.number}</td>
                          <td className={`px-4 py-2 font-bold ${strong}`}>{t.roomNumber}</td>
                          <td className="px-4 py-2">
                            <span className={`font-semibold ${strong}`}>{t.problemType}</span>
                            <span className={`block ${muted}`}>{t.description}</span>
                          </td>
                          <td className="px-4 py-2">{t.employeeName}</td>
                          <td className="px-4 py-2 font-mono">{formatMaintenanceDateTime(t.openedAt, true)}</td>
                          <td className="px-4 py-2 font-mono">
                            {t.stage === "CANCELLED" ? "Cancelada" : t.resolvedAt ? formatMaintenanceDateTime(t.resolvedAt, true) : MAINTENANCE_STAGE_LABEL[t.stage]}
                          </td>
                          <td className="px-4 py-2 text-right font-mono">
                            {minutesLabel(t.minutes)}
                            {t.minutes !== null && !t.resolvedAt ? <span className={muted}> (em aberto)</span> : null}
                          </td>
                        </tr>
                      ))}
                      {report.tickets.length === 0 && (
                        <tr>
                          <td colSpan={7} className={`px-4 py-6 text-center ${muted}`}>Nenhuma OS no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        <p className={`text-[10px] ${muted}`}>
          Tipos de problema e motivos de espera: <Link href="/principal/cadastros/manutencao" className="underline">Central de Cadastros → Listas da Manutenção</Link>.
        </p>
      </div>

      <OsManutencaoModal
        isOpen={!!osTicketId}
        ticketId={osTicketId}
        onClose={() => {
          setOsTicketId(null);
          if (tab === "funil") loadFunnel(true);
        }}
        onChanged={() => (tab === "funil" ? loadFunnel(true) : loadReport())}
      />
    </div>
  );
}

function StatTile({ label, value, sub, card, strong, muted }: { label: string; value: string; sub?: string; card: string; strong: string; muted: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${card}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${strong}`}>{value}</p>
      {sub && <p className={`text-[10px] ${muted}`}>{sub}</p>}
    </div>
  );
}

// Barras horizontais de uma série só (magnitude): uma cor, número em texto ao lado da barra,
// dica ao passar o mouse. A tabela completa fica logo abaixo na tela.
function BarList({
  title,
  rows,
  card,
  strong,
  muted,
  barColor,
  isDark,
  empty = "Nenhuma OS no período.",
}: {
  title: string;
  rows: { label: string; minutes: number; sub?: string }[];
  card: string;
  strong: string;
  muted: string;
  barColor: string;
  isDark: boolean;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${card}`}>
      <h3 className={`text-sm font-bold ${strong}`}>{title}</h3>
      {rows.length === 0 && <p className={`text-xs ${muted}`}>{empty}</p>}
      {rows.map((r) => (
        <div key={r.label} className="space-y-1" title={`${r.label}: ${minutesLabel(r.minutes)}${r.sub ? ` (${r.sub})` : ""}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={`font-semibold truncate ${strong}`}>{r.label}</span>
            <span className={`font-mono shrink-0 ${strong}`}>{minutesLabel(r.minutes)}</span>
          </div>
          <div className={`h-2.5 rounded-sm ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
            <div className="h-2.5 rounded-r" style={{ width: `${Math.max(2, (r.minutes / max) * 100)}%`, backgroundColor: barColor }} />
          </div>
          {r.sub && <p className={`text-[10px] ${muted}`}>{r.sub}</p>}
        </div>
      ))}
    </div>
  );
}
