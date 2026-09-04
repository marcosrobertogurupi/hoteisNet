"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Phone,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  ChevronRight,
  Plus,
  Warehouse,
  Store,
  X,
  ClipboardList,
} from "lucide-react";
import PwaInstallButton from "@/components/PwaInstallButton";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";

interface Me {
  id: string;
  name: string;
  phone: string | null;
}

interface CountRow {
  id: string;
  alvo: string;
  isGeneral: boolean;
  status: "OPEN" | "DONE" | "RECONCILED" | "CANCELLED";
  conferente: string;
  totalItens: number;
  criadaEm: string;
  finalizadaEm: string | null;
}

interface TargetPos {
  id: string;
  name: string;
  location: string | null;
  openCountId: string | null;
}

function statusBadge(status: CountRow["status"], isDark: boolean) {
  const t = (dark: string, light: string) => (isDark ? dark : light);
  switch (status) {
    case "OPEN":
      return { text: "Em contagem", cls: `bg-emerald-500/15 border-emerald-500/30 ${t("text-emerald-300", "text-emerald-700")}` };
    case "DONE":
      return { text: "Aguardando confronto", cls: `bg-amber-500/15 border-amber-500/30 ${t("text-amber-300", "text-amber-700")}` };
    case "RECONCILED":
      return { text: "Confrontada", cls: `bg-sky-500/15 border-sky-500/30 ${t("text-sky-300", "text-sky-700")}` };
    case "CANCELLED":
      return { text: "Cancelada", cls: "bg-slate-500/15 text-slate-500 border-slate-500/30" };
  }
}

export default function ContagemHomePage() {
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark);

  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [active, setActive] = useState<CountRow[]>([]);
  const [recent, setRecent] = useState<CountRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [generalOpenCountId, setGeneralOpenCountId] = useState<string | null>(null);
  const [posTargets, setPosTargets] = useState<TargetPos[]>([]);
  const [opening, setOpening] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/stock-count/me");
      const data = await res.json();
      setMe(data.success ? data.employee : null);
      if (data?.theme) setTheme(data.theme, false); // tema do hotel, sem tentar gravar (não é admin)
    } catch {
      setMe(null);
    } finally {
      setAuthChecked(true);
    }
  }, [setTheme]);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stock-count/counts");
      const data = await res.json();
      if (data.success) {
        setActive(data.active || []);
        setRecent(data.recent || []);
      }
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (me) loadCounts();
  }, [me, loadCounts]);

  // Atualiza a lista quando o funcionário volta para o app (troca de aba / desbloqueia o
  // celular) — sem polling: cobre o caso do assinante ter feito o confronto no computador.
  useEffect(() => {
    if (!me) return;
    const refresh = () => {
      if (!document.hidden) loadCounts();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [me, loadCounts]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!phone.trim() || !password.trim()) {
      setLoginError("Informe telefone e senha.");
      return;
    }
    setLoggingIn(true);
    try {
      const res = await fetch("/api/stock-count/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.error || "Erro ao entrar.");
        return;
      }
      setMe(data.employee);
      if (data.theme) setTheme(data.theme, false);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message || "Erro de rede ao entrar.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/stock-count/logout", { method: "POST" });
    } catch {
      /* segue */
    }
    setMe(null);
    setActive([]);
    setRecent([]);
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerError(null);
    try {
      const res = await fetch("/api/stock-count/targets");
      const data = await res.json();
      if (data.success) {
        setGeneralOpenCountId(data.generalOpenCountId ?? null);
        setPosTargets(data.posLocations || []);
      } else {
        setPickerError(data.error || "Não foi possível carregar os locais.");
      }
    } catch {
      setPickerError("Falha de comunicação ao carregar os locais.");
    }
  };

  const startCount = async (posLocationId: string | null, existingId: string | null) => {
    if (existingId) {
      router.push(`/contagem/${existingId}`);
      return;
    }
    setOpening(true);
    setPickerError(null);
    try {
      const res = await fetch("/api/stock-count/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posLocationId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPickerError(data.error || "Não foi possível abrir a contagem.");
        return;
      }
      router.push(`/contagem/${data.countId}`);
    } catch {
      setPickerError("Falha de comunicação ao abrir a contagem.");
    } finally {
      setOpening(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mx-auto">
              <Boxes className="w-8 h-8" />
            </div>
            <h1 className={`text-xl font-bold ${theme.textMain}`}>Contagem de Estoque</h1>
            <p className={`text-sm ${theme.textMuted}`}>Entre com seu telefone e senha para conferir o estoque.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>Telefone</label>
              <div className="relative">
                <Phone className={`w-4 h-4 absolute left-3.5 top-3.5 ${ui.faint}`} />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(63) 99999-9999"
                  className={`w-full border rounded-2xl pl-11 pr-4 py-3.5 text-base focus:outline-none focus:border-emerald-500 ${ui.field}`}
                />
              </div>
            </div>

            <div>
              <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>Senha</label>
              <div className="relative">
                <Lock className={`w-4 h-4 absolute left-3.5 top-3.5 ${ui.faint}`} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full border rounded-2xl pl-11 pr-11 py-3.5 text-base focus:outline-none focus:border-emerald-500 ${ui.field}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3.5 top-3.5 ${ui.faint}`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && <p className="text-sm text-rose-500 font-medium">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition disabled:opacity-60"
            >
              {loggingIn ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <PwaInstallButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className={`sticky top-0 z-10 backdrop-blur border-b px-4 py-4 flex items-center justify-between ${ui.bar}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className={`text-sm font-bold leading-tight ${theme.textMain}`}>{me.name}</p>
            <p className={`text-[11px] ${theme.textMuted}`}>Conferência de estoque</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className={`p-2.5 rounded-xl border transition ${ui.iconBtn} hover:opacity-80`}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-5 space-y-6">
        <PwaInstallButton />

        <button
          onClick={openPicker}
          className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
        >
          <Plus className="w-5 h-5" /> Nova contagem
        </button>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className={`text-xs font-mono uppercase tracking-wider ${ui.faint}`}>Contagens em andamento</h2>
            <button
              onClick={loadCounts}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs font-semibold hover:opacity-80 transition ${ui.accentText}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {active.length === 0 && !loading && (
            <div className={`text-center py-10 space-y-2 border border-dashed rounded-2xl ${ui.divider}`}>
              <ClipboardList className={`w-8 h-8 mx-auto ${ui.faint}`} />
              <p className={`text-sm ${theme.textMuted}`}>Nenhuma contagem em andamento.</p>
              <p className={`text-xs ${ui.faint}`}>Toque em "Nova contagem" para começar.</p>
            </div>
          )}

          {active.map((c) => (
            <CountCard
              key={c.id}
              c={c}
              onClick={() => router.push(`/contagem/${c.id}`)}
              ui={ui}
              isDark={theme.isDark}
              textMain={theme.textMain}
            />
          ))}
        </section>

        {recent.length > 0 && (
          <section className="space-y-2.5">
            <h2 className={`text-xs font-mono uppercase tracking-wider ${ui.faint}`}>Últimas contagens</h2>
            {recent.map((c) => (
              <CountCard
                key={c.id}
                c={c}
                onClick={() => router.push(`/contagem/${c.id}`)}
                ui={ui}
                isDark={theme.isDark}
                textMain={theme.textMain}
                muted
              />
            ))}
          </section>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`w-full sm:max-w-md border-t sm:border rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto ${ui.sheet}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold ${theme.textMain}`}>O que você vai contar?</h3>
              <button onClick={() => setPickerOpen(false)} className={`p-2 ${theme.textMuted}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {pickerError && <p className="text-sm text-rose-500">{pickerError}</p>}

            <button
              onClick={() => startCount(null, generalOpenCountId)}
              disabled={opening}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border hover:border-emerald-500/50 transition text-left disabled:opacity-60 ${ui.cardSubtle}`}
            >
              <Warehouse className="w-6 h-6 text-emerald-500 shrink-0" />
              <div className="flex-1">
                <p className={`text-sm font-bold ${theme.textMain}`}>Estoque geral / almoxarifado</p>
                <p className={`text-[11px] ${theme.textMuted}`}>
                  {generalOpenCountId ? "Retomar contagem em andamento" : "Iniciar nova contagem"}
                </p>
              </div>
              <ChevronRight className={`w-5 h-5 ${ui.faint}`} />
            </button>

            <div className="space-y-2">
              <p className={`text-[11px] font-mono uppercase tracking-wider px-1 ${ui.faint}`}>Pontos de venda</p>
              {posTargets.length === 0 && <p className={`text-xs px-1 ${theme.textMuted}`}>Nenhum PDV ativo cadastrado.</p>}
              {posTargets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startCount(p.id, p.openCountId)}
                  disabled={opening}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border hover:border-emerald-500/50 transition text-left disabled:opacity-60 ${ui.cardSubtle}`}
                >
                  <Store className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${theme.textMain}`}>{p.name}</p>
                    <p className={`text-[11px] ${theme.textMuted}`}>
                      {p.openCountId ? "Retomar contagem em andamento" : p.location || "Iniciar nova contagem"}
                    </p>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${ui.faint}`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountCard({
  c,
  onClick,
  ui,
  isDark,
  textMain,
  muted,
}: {
  c: CountRow;
  onClick: () => void;
  ui: ReturnType<typeof satelliteAppUI>;
  isDark: boolean;
  textMain: string;
  muted?: boolean;
}) {
  const badge = statusBadge(c.status, isDark);
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition ${
        muted ? ui.cardSubtle : `${ui.card} hover:border-emerald-500/40`
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm font-bold truncate ${textMain}`}>{c.alvo}</p>
        <p className={`text-[11px] ${ui.faint}`}>
          {c.totalItens} item(ns) · {c.conferente}
        </p>
        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <ChevronRight className={`w-5 h-5 shrink-0 ${ui.faint}`} />
    </button>
  );
}
