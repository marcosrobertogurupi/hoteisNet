"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Wrench, Phone, Lock, Eye, EyeOff, RefreshCw } from "lucide-react";
import PwaInstallButton from "@/components/PwaInstallButton";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";

export interface MaintenanceMe {
  id: string;
  name: string;
  hotelName: string;
}

// Sessão do app de manutenção: carrega o colaborador logado (e aplica o tema do hotel). As duas
// telas do app usam isto — o link do WhatsApp cai direto na tela da OS, que também precisa pedir
// login quando o colaborador ainda não entrou.
export function useMaintenanceMe() {
  const { setTheme } = useTheme();
  const [me, setMe] = useState<MaintenanceMe | null>(null);
  const [checked, setChecked] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/manutencao-app/me");
      const data = await res.json();
      setMe(data.success ? { id: data.employee.id, name: data.employee.name, hotelName: data.hotelName || "" } : null);
      if (data?.theme) setTheme(data.theme, false); // tema do hotel, sem gravar (não é admin)
    } catch {
      setMe(null);
    } finally {
      setChecked(true);
    }
  }, [setTheme]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/manutencao-app/logout", { method: "POST" });
    } catch {
      /* segue */
    }
    setMe(null);
  }, []);

  return { me, checked, reload: load, logout };
}

export function MaintenanceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
    </div>
  );
}

export function MaintenanceLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, "amber");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !password.trim()) {
      setError("Informe telefone e senha.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/manutencao-app/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Erro ao entrar.");
        return;
      }
      setPassword("");
      onLoggedIn();
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mx-auto">
            <Wrench className="w-8 h-8" />
          </div>
          <h1 className={`text-xl font-bold ${theme.textMain}`}>Manutenção</h1>
          <p className={`text-sm ${theme.textMuted}`}>Entre com seu telefone e senha para ver suas ordens de serviço.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
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
                className={`w-full border rounded-2xl pl-11 pr-4 py-3.5 text-base focus:outline-none focus:border-amber-500 ${ui.field}`}
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
                className={`w-full border rounded-2xl pl-11 pr-11 py-3.5 text-base focus:outline-none focus:border-amber-500 ${ui.field}`}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className={`absolute right-3.5 top-3.5 ${ui.faint}`}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-base shadow-lg shadow-amber-600/20 transition disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <PwaInstallButton />
      </div>
    </div>
  );
}
