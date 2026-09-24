"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw, ChevronRight, Wrench, Camera, CheckCircle2 } from "lucide-react";
import PwaInstallButton from "@/components/PwaInstallButton";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";
import {
  MAINTENANCE_STAGE_LABEL,
  formatMaintenanceDateTime,
  formatMaintenanceDuration,
  type MaintenanceStageValue,
} from "@/lib/maintenanceShared";
import { useMaintenanceMe, MaintenanceLoading, MaintenanceLogin } from "@/components/manutencao/app/useMaintenanceMe";

interface TicketRow {
  id: string;
  number: number;
  stage: MaintenanceStageValue;
  description: string;
  openedAt: string;
  expectedReleaseAt: string | null;
  resolvedAt: string | null;
  roomNumber: string;
  floor: string;
  problemType: string;
  waitReason: string | null;
  photoCount: number;
}

// App do colaborador de manutenção (/manutencao): as OS abertas atribuídas a ele e as resolvidas
// nos últimos dias. Cada OS abre a tela onde ele avança as etapas e fotografa o problema.
export default function ManutencaoHomePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, "amber");
  const { me, checked, reload, logout } = useMaintenanceMe();

  const [open, setOpen] = useState<TicketRow[]>([]);
  const [recent, setRecent] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/manutencao-app/os");
      const data = await res.json();
      if (data.success) {
        setOpen(data.open || []);
        setRecent(data.recent || []);
      }
    } catch {
      /* silencioso — o botão Atualizar tenta de novo */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  // Atualiza quando o colaborador volta para o app (sem polling).
  useEffect(() => {
    if (!me) return;
    const refresh = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [me, load]);

  if (!checked) return <MaintenanceLoading />;
  if (!me) return <MaintenanceLogin onLoggedIn={reload} />;

  return (
    <div className="min-h-screen pb-24">
      <div className={`sticky top-0 z-10 backdrop-blur border-b px-4 py-4 flex items-center justify-between ${ui.bar}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className={`text-sm font-bold leading-tight ${theme.textMain}`}>{me.name}</p>
            <p className={`text-[11px] ${theme.textMuted}`}>Manutenção{me.hotelName ? ` · ${me.hotelName}` : ""}</p>
          </div>
        </div>
        <button onClick={logout} title="Sair" className={`p-2.5 rounded-xl border transition ${ui.iconBtn} hover:opacity-80`}>
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-5 space-y-6">
        <PwaInstallButton />

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className={`text-xs font-mono uppercase tracking-wider ${ui.faint}`}>Suas ordens de serviço</h2>
            <button
              onClick={load}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition ${ui.accentText}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {open.length === 0 && !loading && (
            <div className={`text-center py-10 space-y-2 border border-dashed rounded-2xl ${ui.divider}`}>
              <CheckCircle2 className={`w-8 h-8 mx-auto ${ui.faint}`} />
              <p className={`text-sm ${theme.textMuted}`}>Nenhuma OS aberta com você.</p>
              <p className={`text-xs ${ui.faint}`}>Quando a recepção abrir uma, você recebe o aviso no WhatsApp.</p>
            </div>
          )}

          {open.map((t) => (
            <TicketCard key={t.id} t={t} onClick={() => router.push(`/manutencao/os/${t.id}`)} ui={ui} textMain={theme.textMain} textMuted={theme.textMuted} />
          ))}
        </section>

        {recent.length > 0 && (
          <section className="space-y-2.5">
            <h2 className={`text-xs font-mono uppercase tracking-wider ${ui.faint}`}>Resolvidas nos últimos dias</h2>
            {recent.map((t) => (
              <TicketCard key={t.id} t={t} onClick={() => router.push(`/manutencao/os/${t.id}`)} ui={ui} textMain={theme.textMain} textMuted={theme.textMuted} muted />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function TicketCard({
  t,
  onClick,
  ui,
  textMain,
  textMuted,
  muted,
}: {
  t: TicketRow;
  onClick: () => void;
  ui: ReturnType<typeof satelliteAppUI>;
  textMain: string;
  textMuted: string;
  muted?: boolean;
}) {
  const stageCls =
    t.stage === "RESOLVED"
      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600"
      : t.stage === "WAITING"
        ? "bg-sky-500/15 border-sky-500/30 text-sky-600"
        : t.stage === "EVALUATING"
          ? "bg-amber-500/15 border-amber-500/30 text-amber-600"
          : "bg-rose-500/15 border-rose-500/30 text-rose-600";
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition ${
        muted ? ui.cardSubtle : `${ui.card} hover:border-amber-500/40`
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-rose-700 text-white font-mono font-bold flex items-center justify-center shrink-0">
          {t.roomNumber}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-bold truncate ${textMain}`}>
            <Wrench className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-amber-500" />
            {t.problemType} · OS nº {t.number}
          </p>
          <p className={`text-xs truncate ${textMuted}`}>{t.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stageCls}`}>
              {MAINTENANCE_STAGE_LABEL[t.stage]}
              {t.stage === "WAITING" && t.waitReason ? ` · ${t.waitReason}` : ""}
            </span>
            <span className={`text-[10px] ${ui.faint}`}>
              {t.resolvedAt
                ? `Resolvida em ${formatMaintenanceDateTime(t.resolvedAt)}`
                : `Parado há ${formatMaintenanceDuration(Date.now() - new Date(t.openedAt).getTime())}`}
            </span>
            {t.photoCount > 0 && (
              <span className={`text-[10px] flex items-center gap-0.5 ${ui.faint}`}>
                <Camera className="w-3 h-3" /> {t.photoCount}
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight className={`w-5 h-5 shrink-0 ${ui.faint}`} />
    </button>
  );
}
