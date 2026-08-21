"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RefreshCw, Sparkles, Clock, ListChecks, UserCheck } from "lucide-react";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface HousekeeperOption {
  id: string;
  name: string;
}

interface HousekeeperStats {
  housekeeperId: string;
  name: string;
  photoUrl: string | null;
  totalTasks: number;
  checkoutCount: number;
  occupiedCount: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
}

interface RecentTask {
  housekeeperName: string;
  roomNumber: string;
  type: "CHECKOUT" | "OCCUPIED";
  durationSeconds: number | null;
  finishedAt: string;
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function formatDateBR(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toISODateInput(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function RelatorioLimpezasPage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();
  const isDark = theme.isDark;
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [housekeepers, setHousekeepers] = useState<HousekeeperOption[]>([]);
  const [selectedHousekeeperId, setSelectedHousekeeperId] = useState("");
  const [from, setFrom] = useState(toISODateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toISODateInput(new Date()));

  const [loading, setLoading] = useState(false);
  const [overall, setOverall] = useState({ totalTasks: 0, checkoutCount: 0, occupiedCount: 0, totalDurationSeconds: 0, avgDurationSeconds: 0 });
  const [perHousekeeper, setPerHousekeeper] = useState<HousekeeperStats[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);

  useEffect(() => {
    fetch("/api/tenant/housekeepers")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.housekeepers)) {
          setHousekeepers(data.housekeepers.map((h: any) => ({ id: h.id, name: h.name })));
        }
      })
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tenantId, from, to });
      if (selectedHousekeeperId) params.set("housekeeperId", selectedHousekeeperId);
      const res = await fetch(`/api/tenant/housekeeping-report?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOverall(data.overall);
        setPerHousekeeper(data.perHousekeeper || []);
        setRecentTasks(data.recentTasks || []);
      }
    } catch (err) {
      console.error("Erro ao buscar relatório de limpezas:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, from, to, selectedHousekeeperId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const applyPreset = (days: number) => {
    setFrom(toISODateInput(new Date(Date.now() - days * 24 * 60 * 60 * 1000)));
    setTo(toISODateInput(new Date()));
  };

  const hotelDisplayName = hotelNameTheme || "HOTEL";
  const selectedHousekeeperName = housekeepers.find((h) => h.id === selectedHousekeeperId)?.name;
  const maxTasks = Math.max(1, ...perHousekeeper.map((h) => h.totalTasks));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/app/cadastros/governantas"
            className={`p-2 rounded-lg border transition-colors ${theme.bgCard}`}
            title="Voltar para Governantas"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-500" />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Relatório de Limpezas</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${theme.bgCard}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors bg-rose-600 hover:bg-rose-700"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir relatório
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className={`flex flex-wrap items-end gap-4 p-4 rounded-2xl border print:hidden ${theme.bgCard}`}>
        <div>
          <label className={`text-[11px] font-semibold block mb-1 ${theme.textMuted}`}>Governanta</label>
          <select
            value={selectedHousekeeperId}
            onChange={(e) => setSelectedHousekeeperId(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500 ${
              isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
            }`}
          >
            <option value="">Todas as governantas</option>
            {housekeepers.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={`text-[11px] font-semibold block mb-1 ${theme.textMuted}`}>De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500 ${
              isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
            }`}
          />
        </div>
        <div>
          <label className={`text-[11px] font-semibold block mb-1 ${theme.textMuted}`}>Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500 ${
              isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
            }`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => applyPreset(d)}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border transition ${
                isDark ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700" : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Painel visual (tela) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        {[
          { icon: ListChecks, label: "Total de limpezas", value: overall.totalTasks, iconClass: "bg-emerald-500/15 text-emerald-500" },
          { icon: Sparkles, label: "Pós check-out / Arrumação", value: `${overall.checkoutCount} / ${overall.occupiedCount}`, iconClass: "bg-amber-500/15 text-amber-500" },
          { icon: Clock, label: "Tempo médio por limpeza", value: formatDuration(overall.avgDurationSeconds), iconClass: "bg-sky-500/15 text-sky-500" },
          { icon: UserCheck, label: "Tempo total dedicado", value: formatDuration(overall.totalDurationSeconds), iconClass: "bg-violet-500/15 text-violet-500" },
        ].map((card, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border ${theme.bgCard}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${card.iconClass}`}>
              <card.icon className="w-4.5 h-4.5" />
            </div>
            <p className={`text-xl font-bold ${theme.textMain}`}>{card.value}</p>
            <p className={`text-[11px] ${theme.textMuted}`}>{card.label}</p>
          </div>
        ))}
      </div>

      {/* Comparativo entre governantas (tela) */}
      {!selectedHousekeeperId && perHousekeeper.length > 0 && (
        <div className={`p-4 rounded-2xl border space-y-3 print:hidden ${theme.bgCard}`}>
          <h3 className={`text-xs font-mono uppercase tracking-wider ${theme.textMuted}`}>Limpezas por governanta</h3>
          {perHousekeeper.map((h) => (
            <div key={h.housekeeperId} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-semibold ${theme.textMain}`}>{h.name}</span>
                <span className={theme.textMuted}>{h.totalTasks} limpeza{h.totalTasks !== 1 ? "s" : ""} • média {formatDuration(h.avgDurationSeconds)}</span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(h.totalTasks / maxTasks) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documento imprimível */}
      <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-4 print:p-0 print:rounded-none print-container">
        <RelatorioPrintHeader
          hotelName={hotelDisplayName}
          hotelLogo={hotelLogo}
          showLogo={showLogoInPrint}
          title={`Relatório de Limpezas${selectedHousekeeperName ? ` — ${selectedHousekeeperName}` : " — Todas as Governantas"}`}
        />

        <div className="text-[11px] text-slate-600 text-center">
          Período: {new Date(`${from}T00:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${to}T00:00:00`).toLocaleDateString("pt-BR")}
        </div>

        <div className="grid grid-cols-4 gap-2 avoid-break">
          <div className="border border-slate-900 p-2 text-center">
            <div className="text-lg font-bold">{overall.totalTasks}</div>
            <div className="text-[9px] uppercase text-slate-600">Total limpezas</div>
          </div>
          <div className="border border-slate-900 p-2 text-center">
            <div className="text-lg font-bold">{overall.checkoutCount} / {overall.occupiedCount}</div>
            <div className="text-[9px] uppercase text-slate-600">Checkout / Arrumação</div>
          </div>
          <div className="border border-slate-900 p-2 text-center">
            <div className="text-lg font-bold">{formatDuration(overall.avgDurationSeconds)}</div>
            <div className="text-[9px] uppercase text-slate-600">Tempo médio</div>
          </div>
          <div className="border border-slate-900 p-2 text-center">
            <div className="text-lg font-bold">{formatDuration(overall.totalDurationSeconds)}</div>
            <div className="text-[9px] uppercase text-slate-600">Tempo total</div>
          </div>
        </div>

        {!selectedHousekeeperId && (
          <div className="avoid-break">
            <div className="font-bold text-slate-900 bg-slate-100 px-2 py-1 border border-slate-900 mb-1">
              Resumo por governanta
            </div>
            <table className="w-full text-left border-collapse mb-2">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="p-1.5">Governanta</th>
                  <th className="p-1.5 text-center">Total</th>
                  <th className="p-1.5 text-center">Pós check-out</th>
                  <th className="p-1.5 text-center">Arrumação</th>
                  <th className="p-1.5 text-center">Tempo total</th>
                  <th className="p-1.5 text-center">Tempo médio</th>
                </tr>
              </thead>
              <tbody>
                {perHousekeeper.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-slate-400 italic">
                      {loading ? "Carregando..." : "Nenhuma limpeza concluída no período."}
                    </td>
                  </tr>
                ) : (
                  perHousekeeper.map((h) => (
                    <tr key={h.housekeeperId} className="border-b border-slate-300">
                      <td className="p-1.5 font-bold">{h.name}</td>
                      <td className="p-1.5 text-center">{h.totalTasks}</td>
                      <td className="p-1.5 text-center">{h.checkoutCount}</td>
                      <td className="p-1.5 text-center">{h.occupiedCount}</td>
                      <td className="p-1.5 text-center">{formatDuration(h.totalDurationSeconds)}</td>
                      <td className="p-1.5 text-center">{formatDuration(h.avgDurationSeconds)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="avoid-break">
          <div className="font-bold text-slate-900 bg-slate-100 px-2 py-1 border border-slate-900 mb-1">
            Detalhamento das limpezas {selectedHousekeeperName ? `de ${selectedHousekeeperName}` : ""}
          </div>
          <table className="w-full text-left border-collapse mb-2">
            <thead>
              <tr className="border-b-2 border-slate-900">
                <th className="p-1.5">Data / Hora</th>
                {!selectedHousekeeperId && <th className="p-1.5">Governanta</th>}
                <th className="p-1.5">Quarto</th>
                <th className="p-1.5">Tipo</th>
                <th className="p-1.5 text-right">Duração</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.length === 0 ? (
                <tr>
                  <td colSpan={selectedHousekeeperId ? 4 : 5} className="p-3 text-center text-slate-400 italic">
                    {loading ? "Carregando..." : "Nenhuma limpeza concluída no período."}
                  </td>
                </tr>
              ) : (
                recentTasks.map((t, idx) => (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="p-1.5">{formatDateBR(t.finishedAt)}</td>
                    {!selectedHousekeeperId && <td className="p-1.5">{t.housekeeperName}</td>}
                    <td className="p-1.5 font-bold">{t.roomNumber}</td>
                    <td className="p-1.5">{t.type === "OCCUPIED" ? "Arrumação" : "Pós check-out"}</td>
                    <td className="p-1.5 text-right">{formatDuration(t.durationSeconds || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
