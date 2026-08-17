"use client";

import React, { useState } from "react";
import { ShieldCheck, X, Loader2, AlertTriangle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export interface AdminAuthorizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Curta descrição da ação sendo autorizada (aparece na tela e vai para a auditoria). */
  reason: string;
  onAuthorized: (admin: { id: string; name: string; role: string }) => void;
}

// Modal genérico de autorização "step-up": pede e-mail + senha de um usuário com papel
// ADMIN/SUPER_ADMIN para liberar uma ação sensível (ex: cortesia), sem abrir sessão nem
// trocar o operador ativo no terminal. Reutilizável em qualquer fluxo que precise desse gate.
export default function AdminAuthorizationModal({ isOpen, onClose, reason, onAuthorized }: AdminAuthorizationModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Informe e-mail e senha do administrador.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, reason }),
      });
      const data = await res.json();
      if (data.success && data.admin) {
        setEmail("");
        setPassword("");
        onAuthorized(data.admin);
      } else {
        setError(data.error || "Não foi possível autorizar.");
      }
    } catch {
      setError("Falha de comunicação ao tentar autorizar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setPassword("");
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden ${isDark ? "bg-[#0F172A] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
        <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold">Autorização de Administrador</span>
          </div>
          <button onClick={handleClose} className={`p-1 rounded hover:bg-slate-700/40 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className={`flex items-start gap-2 text-[11px] p-2 rounded-lg border ${isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800"}`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Esta ação exige aprovação de um administrador: <strong>{reason}</strong></span>
          </div>

          <div>
            <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>E-mail do administrador</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className={`w-full rounded-md px-2.5 py-1.5 text-xs border outline-none ${isDark ? "bg-slate-950 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"}`}
              placeholder="admin@hotel.com"
            />
          </div>

          <div>
            <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className={`w-full rounded-md px-2.5 py-1.5 text-xs border outline-none ${isDark ? "bg-slate-950 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"}`}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-[11px] text-red-400 font-semibold">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold ${isDark ? "text-slate-300 hover:bg-slate-700/50" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-md text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Autorizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
