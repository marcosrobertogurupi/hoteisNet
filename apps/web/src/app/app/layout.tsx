"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import CashRegisterGate from "@/components/CashRegisterGate";
import InactivityLock from "@/components/InactivityLock";
import { Settings, Bell, Bot, ShieldAlert, Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useOperator } from "@/context/OperatorContext";
import { playHumanInterventionSound } from "@/utils/notificationSound";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  TENANT_ADMIN: "Administrador",
  RECEPCIONIST: "Recepção",
  GOVERNESS: "Governança",
  FINANCIAL: "Financeiro",
};

interface HumanEscalation {
  id: string;
  source: "SUPPORT_AGENT" | "OPERATIONAL_AGENT";
  reason: string;
  guestPhone: string | null;
  createdAt: string;
}

// Só aparece no Mapa de Quartos e Mapa de Reservas (allowlist, não blocklist) — quem está no
// financeiro não precisa saber de pendência de reserva/hospedagem. Alimentado por
// HumanEscalation (escalate_to_human do Agente de Atendimento + alertas do Agente Operacional).
function HumanEscalationBell() {
  const { theme, humanInterventionSoundEnabled } = useTheme();
  const [escalations, setEscalations] = useState<HumanEscalation[]>([]);
  const [open, setOpen] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  // Alertas do Agente Operacional só existem quando algo já ultrapassou o limite (ex.: quarto
  // aguardando limpeza há mais de 6h) — por isso são sempre tratados como prioridade e piscam
  // até serem resolvidos, em vez do pulso de 4s usado para qualquer chegada nova.
  const hasPriorityAlert = escalations.some((e) => e.source === "OPERATIONAL_AGENT");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/human-escalations?resolved=false");
      const data = await res.json();
      if (!data.success) return;
      setEscalations((prev) => {
        if (data.escalations.length > prev.length && humanInterventionSoundEnabled) {
          playHumanInterventionSound();
          setPulsing(true);
          setTimeout(() => setPulsing(false), 4000);
        }
        return data.escalations;
      });
    } catch {
      // silencioso — não deve travar a tela por falha de rede num alerta secundário
    }
  }, [humanInterventionSoundEnabled]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const resolve = async (id: string) => {
    setEscalations((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/tenant/human-escalations/${id}`, { method: "PATCH" });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-lg transition-colors relative border ${pulsing ? "animate-pulse" : ""} ${theme.isDark ? "bg-slate-800/60 text-slate-300 hover:text-white border-slate-700/60" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"}`}
      >
        <Bell className="w-4 h-4" />
        {escalations.length > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
              hasPriorityAlert ? "animate-human-escalation-blink" : "bg-red-500"
            }`}
          >
            {escalations.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border shadow-2xl z-50 ${theme.bgCard}`}>
            <div className="p-3 border-b border-slate-800/30 text-xs font-bold">Precisa de intervenção humana</div>
            {escalations.length === 0 ? (
              <p className="p-4 text-center text-xs opacity-60">Nada pendente.</p>
            ) : (
              <div className="divide-y divide-slate-800/30">
                {escalations.map((e) => (
                  <div
                    key={e.id}
                    className={`p-3 space-y-1.5 ${e.source === "OPERATIONAL_AGENT" ? "border-l-2 border-red-500 bg-red-500/5" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      {e.source === "SUPPORT_AGENT" ? <Bot className="w-3.5 h-3.5 text-violet-500" /> : <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
                      {e.source === "SUPPORT_AGENT" ? "Agente de Atendimento" : "Agente Operacional"}
                      {e.guestPhone && <span className="opacity-60 font-normal">· {e.guestPhone}</span>}
                    </div>
                    <p className="text-xs">{e.reason}</p>
                    <button
                      onClick={() => resolve(e.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500 hover:text-emerald-400"
                    >
                      <Check className="w-3 h-3" /> Marcar como resolvido
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TenantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { user } = useSession();
  const { setOperator } = useOperator();
  const isSettingsPage = pathname?.startsWith("/app/settings");
  const displayName = user?.name || "";
  const roleLabel = user ? (ROLE_LABELS[user.role] || user.role) : "";

  // O operador ativo (usado nos lançamentos de caixa) é sempre o usuário realmente logado.
  // Sincronizado aqui no layout raiz (e não só na Sidebar) para já estar correto quando o
  // CashRegisterGate faz sua checagem, mesmo antes da Sidebar montar.
  useEffect(() => {
    if (user) setOperator(user.id, user.name);
  }, [user, setOperator]);

  return (
    <>
    <InactivityLock />
    <CashRegisterGate>
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain}`}>
      {/* Retractable Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className={`h-16 px-6 flex items-center justify-between border-b transition-colors print:hidden ${theme.bgHeader}`}>
          <div className="flex items-center gap-4">
            <img
              src="/brand/icon.png"
              alt="Hoteis.Net"
              className="w-8 h-8 rounded-lg object-contain shrink-0"
            />
            <h1 className="text-lg font-semibold tracking-tight">Hoteis.Net SaaS que trabalha por você</h1>
            {isSettingsPage && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono ${theme.badgeBg}`}>
                WhatsApp: Conectado
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {displayName && (
              <div className="flex items-center gap-2 pr-1">
                <div className="w-8 h-8 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {displayName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="text-right leading-tight hidden sm:block">
                  <p className="text-sm font-semibold">{displayName}</p>
                  {roleLabel && <p className={`text-xs ${theme.isDark ? "text-slate-400" : "text-slate-500"}`}>{roleLabel}</p>}
                </div>
              </div>
            )}
            {(pathname === "/app" || pathname === "/app/reservations") && <HumanEscalationBell />}
            <Link
              href="/app/settings"
              className={`p-2 rounded-lg transition-colors border ${theme.isDark ? "bg-slate-800/60 text-slate-300 hover:text-white border-slate-700/60" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"}`}
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Page View Area */}
        <main className={`flex-1 overflow-y-auto p-6 transition-colors ${theme.bgApp}`}>
          {children}
        </main>
      </div>
    </div>
    </CashRegisterGate>
    </>
  );
}
