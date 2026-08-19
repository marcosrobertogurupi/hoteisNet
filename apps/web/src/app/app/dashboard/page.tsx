"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Percent,
  LogIn,
  LogOut,
  Sparkles,
  Moon,
  Repeat,
  RefreshCw,
  Star,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface SeriePonto {
  date: string;
  label: string;
  ocupacao: number | null;
  vacancia: number | null;
}

interface RoomStat {
  id: string;
  number: string;
  floor: string;
  noites: number;
}

interface DashboardMetrics {
  ocupacaoAtual: { ocupados: number; total: number; taxa: number };
  checkinsHoje: number;
  checkoutsHoje: number;
  quartosLimpezaPendente: number;
  permanenciaMedia: number;
  recorrencia: { taxa: number; recorrentes: number; totalHospedesPeriodo: number };
  serie15Dias: SeriePonto[];
  maisOcupados: RoomStat[];
  menosOcupados: RoomStat[];
}

// Palette validada com o script validate_palette.js do skill de dataviz (paleta padrão
// documentada) — slot 1 (azul) e slot 2 (laranja), passos claro/escuro.
const CHART_COLORS = {
  light: { a: "#2a78d6", b: "#eb6834", grid: "#e1e0d9", axis: "#898781" },
  dark: { a: "#3987e5", b: "#d95926", grid: "#2c2c2a", axis: "#898781" },
};

function SerieTooltip({ active, payload, label, theme }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={`px-3 py-2 rounded-lg border text-xs shadow-lg ${theme.bgCard}`}>
      <div className={`font-semibold mb-1 ${theme.textMuted}`}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className={theme.textMain}>
            {p.name}: <strong>{p.value ?? "-"}%</strong>
          </span>
        </div>
      ))}
    </div>
  );
}

function RoomTooltip({ active, payload, theme }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as RoomStat;
  return (
    <div className={`px-3 py-2 rounded-lg border text-xs shadow-lg ${theme.bgCard}`}>
      <div className={`font-semibold ${theme.textMain}`}>Quarto {d.number}</div>
      <div className={theme.textMuted}>Andar: {d.floor}</div>
      <div className={theme.textMain}>
        Noites ocupadas: <strong>{d.noites}</strong>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { theme } = useTheme();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/metrics?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.success) setMetrics(data);
    } catch (err) {
      console.error("Erro ao buscar métricas do dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const colors = theme.isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  const statTiles = metrics
    ? [
        {
          label: "Ocupação Atual",
          value: `${metrics.ocupacaoAtual.taxa}%`,
          sub: `${metrics.ocupacaoAtual.ocupados} de ${metrics.ocupacaoAtual.total} quartos`,
          icon: Percent,
          color: "#2a78d6",
        },
        {
          label: "Check-ins Hoje",
          value: metrics.checkinsHoje,
          sub: "Entradas registradas",
          icon: LogIn,
          color: "#1baf7a",
        },
        {
          label: "Check-outs Hoje",
          value: metrics.checkoutsHoje,
          sub: "Saídas realizadas",
          icon: LogOut,
          color: "#eb6834",
        },
        {
          label: "P/ Limpeza",
          value: metrics.quartosLimpezaPendente,
          sub: "Quartos pendentes",
          icon: Sparkles,
          color: "#eda100",
        },
        {
          label: "Permanência Média",
          value: `${metrics.permanenciaMedia}d`,
          sub: "Últimos 90 dias",
          icon: Moon,
          color: "#4a3aa7",
        },
        {
          label: "Hóspedes Recorrentes",
          value: `${metrics.recorrencia.taxa}%`,
          sub: `${metrics.recorrencia.recorrentes} de ${metrics.recorrencia.totalHospedesPeriodo} (90d)`,
          icon: Repeat,
          color: "#e87ba4",
        },
      ]
    : [];

  const temSerie = metrics?.serie15Dias.some((p) => p.ocupacao !== null) ?? false;
  const temRanking = metrics ? metrics.maisOcupados.some((r) => r.noites > 0) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            style={{ backgroundColor: `${theme.primaryColor}22` }}
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          >
            <LayoutDashboard className="w-5 h-5" style={{ color: theme.primaryColor }} />
          </div>
          <div>
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Dashboard</h1>
            <p className={`text-xs ${theme.textMuted}`}>Visão geral operacional do hotel.</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${theme.bgCard}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {(metrics ? statTiles : Array.from({ length: 6 })).map((tile: any, i) => (
          <div key={tile?.label || i} className={`p-4 rounded-2xl border ${theme.bgCard}`}>
            {tile ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    style={{ backgroundColor: `${tile.color}22` }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  >
                    <tile.icon className="w-4 h-4" style={{ color: tile.color }} />
                  </div>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${theme.textMuted}`}>
                    {tile.label}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${theme.textMain}`}>{tile.value}</div>
                <div className={`text-[11px] mt-0.5 ${theme.textMuted}`}>{tile.sub}</div>
              </>
            ) : (
              <div className="h-16 animate-pulse rounded-lg bg-slate-500/10" />
            )}
          </div>
        ))}
      </div>

      {/* Ocupação x Vacância — 15 dias */}
      <div className={`p-5 rounded-2xl border ${theme.bgCard}`}>
        <h3 className={`text-sm font-bold mb-1 ${theme.textMain}`}>Ocupação x Vacância — últimos 15 dias</h3>
        <p className={`text-xs mb-4 ${theme.textMuted}`}>Percentual médio diário de quartos ocupados e vagos.</p>
        {!metrics ? (
          <div className="h-64 animate-pulse rounded-lg bg-slate-500/10" />
        ) : !temSerie ? (
          <div className={`h-64 flex items-center justify-center text-center text-xs px-8 ${theme.textMuted}`}>
            Ainda não há histórico suficiente. Os dados aparecem conforme os snapshots horários de ocupação forem
            registrados.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={metrics.serie15Dias} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: colors.axis }}
                axisLine={{ stroke: colors.grid }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: colors.axis }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<SerieTooltip theme={theme} />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="ocupacao"
                name="Ocupação"
                stroke={colors.a}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="vacancia"
                name="Vacância"
                stroke={colors.b}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Ranking de quartos — 30 dias */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={`p-5 rounded-2xl border ${theme.bgCard}`}>
          <h3 className={`text-sm font-bold mb-1 ${theme.textMain}`}>5 Quartos Mais Ocupados</h3>
          <p className={`text-xs mb-4 ${theme.textMuted}`}>Noites ocupadas nos últimos 30 dias.</p>
          {!metrics ? (
            <div className="h-56 animate-pulse rounded-lg bg-slate-500/10" />
          ) : !temRanking ? (
            <div className={`h-56 flex items-center justify-center text-center text-xs px-8 ${theme.textMuted}`}>
              Nenhuma hospedagem registrada nos últimos 30 dias.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.maisOcupados} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="number"
                  tick={{ fontSize: 11, fill: colors.axis }}
                  axisLine={{ stroke: colors.grid }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: colors.axis }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<RoomTooltip theme={theme} />} />
                <Bar dataKey="noites" fill={colors.a} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={`p-5 rounded-2xl border ${theme.bgCard}`}>
          <h3 className={`text-sm font-bold mb-1 ${theme.textMain}`}>5 Quartos Menos Ocupados</h3>
          <p className={`text-xs mb-4 ${theme.textMuted}`}>Noites ocupadas nos últimos 30 dias.</p>
          {!metrics ? (
            <div className="h-56 animate-pulse rounded-lg bg-slate-500/10" />
          ) : !temRanking ? (
            <div className={`h-56 flex items-center justify-center text-center text-xs px-8 ${theme.textMuted}`}>
              Nenhuma hospedagem registrada nos últimos 30 dias.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.menosOcupados} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="number"
                  tick={{ fontSize: 11, fill: colors.axis }}
                  axisLine={{ stroke: colors.grid }}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11, fill: colors.axis }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<RoomTooltip theme={theme} />} />
                <Bar dataKey="noites" fill={colors.b} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Reviews dos canais — reservado para implementação futura */}
      <div className={`p-5 rounded-2xl border border-dashed ${theme.bgCard}`}>
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-4 h-4" style={{ color: "#eda100" }} />
          <h3 className={`text-sm font-bold ${theme.textMain}`}>Reviews dos Canais</h3>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400">
            Em breve
          </span>
        </div>
        <p className={`text-xs mb-4 ${theme.textMuted}`}>
          Espaço reservado para reunir avaliações positivas e negativas do TripAdvisor, Google Maps e Reclame Aqui
          em um só lugar.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {["TripAdvisor", "Google Maps", "Reclame Aqui"].map((canal) => (
            <div key={canal} className={`p-3 rounded-xl border border-dashed text-center ${theme.borderColor}`}>
              <span className={`text-xs font-semibold ${theme.textMuted}`}>{canal}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
