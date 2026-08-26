"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Mail, LogIn, Loader2 } from "lucide-react";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
}

interface LoginFormProps {
  // "page": wrapper de tela cheia usado em /login. "lock": só o card, para a sobreposição de
  // bloqueio por inatividade (ver components/InactivityLock.tsx).
  variant?: "page" | "lock";
  // Texto opcional acima do formulário (usado no modo "lock").
  headline?: string;
  subhead?: string;
  // Quando informado, é chamado após o login bem-sucedido em vez de navegar. Se retornar uma
  // string, ela é exibida como erro e o formulário é reabilitado; se retornar void, o caller
  // assume o controle (ex.: recarregar a página).
  onAuthenticated?: (user: AuthenticatedUser) => Promise<string | void> | string | void;
}

export default function LoginForm({ variant = "page", headline, subhead, onAuthenticated }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Não foi possível entrar.");
        setLoading(false);
        return;
      }

      if (onAuthenticated) {
        const rejection = await onAuthenticated(data.user as AuthenticatedUser);
        if (typeof rejection === "string" && rejection) {
          setError(rejection);
          setPassword("");
          setLoading(false);
        }
        // Se não houve rejeição, o caller cuida do próximo passo (ex.: window.location.reload()).
        return;
      }

      const next = searchParams.get("next") || "/app";
      // Navegação "dura" (não client-side router.push): garante uma requisição HTTP real
      // que carrega o cookie de sessão recém-emitido antes do middleware avaliar a rota.
      window.location.href = next;
    } catch (err) {
      setError("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  };

  const card = (
    <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
      <div className="flex flex-col items-center mb-6">
        <img
          src="/brand/icon.png"
          alt="Hoteis.Net"
          className="w-12 h-12 rounded-xl object-contain mb-3"
        />
        <h1 className="text-lg font-bold text-slate-900">{headline || "Hoteis.Net PMS SaaS"}</h1>
        <p className="text-xs text-slate-500 mt-1 text-center">{subhead || "Entre com seu e-mail e senha"}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="username"
              autoFocus
              className="w-full bg-white border border-slate-300 rounded-lg py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Senha</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-white border border-slate-300 rounded-lg py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-[#0284C7] focus:ring-1 focus:ring-[#0284C7]"
            />
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-60 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Entrar
        </button>

        <p className="text-[10px] text-slate-400 text-center pt-1">
          O terminal desta sessão é identificado automaticamente pelo sistema para fins de auditoria.
        </p>
      </form>
    </div>
  );

  if (variant === "lock") return card;

  return <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">{card}</div>;
}
