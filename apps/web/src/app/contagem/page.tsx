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

const STATUS_LABEL: Record<CountRow["status"], { text: string; cls: string }> = {
  OPEN: { text: "Em contagem", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  DONE: { text: "Aguardando confronto", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  RECONCILED: { text: "Confrontada", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  CANCELLED: { text: "Cancelada", cls: "bg-slate-600/20 text-slate-400 border-slate-600/30" },
};

export default function ContagemHomePage() {
  const router = useRouter();

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
    } catch {
      setMe(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

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
      <div className="min-h-screen bg-[#0a0f1a] text-slate-100 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <Boxes className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold">Contagem de Estoque</h1>
            <p className="text-sm text-slate-400">Entre com seu telefone e senha para conferir o estoque.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-300">Telefone</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(63) 99999-9999"
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-base focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-300">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-11 py-3.5 text-base focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && <p className="text-sm text-red-400 font-medium">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition disabled:opacity-60"
            >
              {loggingIn ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100 pb-24">
      <div className="sticky top-0 z-10 bg-[#0a0f1a]/95 backdrop-blur border-b border-slate-800 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
            {me.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">{me.name}</p>
            <p className="text-[11px] text-slate-400">Conferência de estoque</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-5 space-y-6">
        <button
          onClick={openPicker}
          className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition"
        >
          <Plus className="w-5 h-5" /> Nova contagem
        </button>

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500">Contagens em andamento</h2>
            <button
              onClick={loadCounts}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {active.length === 0 && !loading && (
            <div className="text-center py-10 space-y-2 border border-dashed border-slate-800 rounded-2xl">
              <ClipboardList className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">Nenhuma contagem em andamento.</p>
              <p className="text-xs text-slate-600">Toque em "Nova contagem" para começar.</p>
            </div>
          )}

          {active.map((c) => (
            <CountCard key={c.id} c={c} onClick={() => router.push(`/contagem/${c.id}`)} />
          ))}
        </section>

        {recent.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500">Últimas contagens</h2>
            {recent.map((c) => (
              <CountCard key={c.id} c={c} onClick={() => router.push(`/contagem/${c.id}`)} muted />
            ))}
          </section>
        )}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-30 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-[#0e1524] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">O que você vai contar?</h3>
              <button onClick={() => setPickerOpen(false)} className="p-2 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pickerError && <p className="text-sm text-red-400">{pickerError}</p>}

            <button
              onClick={() => startCount(null, generalOpenCountId)}
              disabled={opening}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition text-left disabled:opacity-60"
            >
              <Warehouse className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold">Estoque geral / almoxarifado</p>
                <p className="text-[11px] text-slate-500">
                  {generalOpenCountId ? "Retomar contagem em andamento" : "Iniciar nova contagem"}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>

            <div className="space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-wider text-slate-600 px-1">Pontos de venda</p>
              {posTargets.length === 0 && <p className="text-xs text-slate-500 px-1">Nenhum PDV ativo cadastrado.</p>}
              {posTargets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startCount(p.id, p.openCountId)}
                  disabled={opening}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition text-left disabled:opacity-60"
                >
                  <Store className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {p.openCountId ? "Retomar contagem em andamento" : p.location || "Iniciar nova contagem"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountCard({ c, onClick, muted }: { c: CountRow; onClick: () => void; muted?: boolean }) {
  const badge = STATUS_LABEL[c.status];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition ${
        muted ? "bg-slate-900/40 border-slate-800/60" : "bg-slate-900/80 border-slate-800 hover:border-emerald-500/40"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold truncate">{c.alvo}</p>
        <p className="text-[11px] text-slate-500">
          {c.totalItens} item(ns) · {c.conferente}
        </p>
        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-600 shrink-0" />
    </button>
  );
}
