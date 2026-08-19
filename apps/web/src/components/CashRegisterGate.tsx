"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";
import { CAIXA_CHANGED_EVENT } from "@/lib/caixaEvents";

// Bloqueia o app inteiro (todas as rotas de /app) enquanto o usuário autenticado não tiver um
// caixa aberto — nenhum usuário, incluindo admin/super admin, pode operar o sistema sem um caixa
// próprio aberto. Reavalia a cada navegação e sempre que o evento CAIXA_CHANGED_EVENT é disparado
// (abertura, fechamento ou impressão do fechamento do caixa).
export default function CashRegisterGate({ children }: { children: React.ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const toast = useToast();
  const { theme, hotelName } = useTheme();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);
  const [fundoTroco, setFundoTroco] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const checkSessao = useCallback(async () => {
    try {
      const res = await fetch("/api/caixa/sessao");
      const data = await res.json();
      setCaixaAberto(!!(data.success && data.isOpen));
    } catch {
      setCaixaAberto(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (user) checkSessao();
  }, [user, checkSessao, pathname]);

  useEffect(() => {
    window.addEventListener(CAIXA_CHANGED_EVENT, checkSessao);
    return () => window.removeEventListener(CAIXA_CHANGED_EVENT, checkSessao);
  }, [checkSessao]);

  const handleAbrirCaixa = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/caixa/abrir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundoTroco: Number(fundoTroco) || 0 }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Erro ao abrir caixa.");
        return;
      }
      toast.success(data.message || "Caixa aberto com sucesso!");
      setFundoTroco("");
      await checkSessao();
    } catch {
      toast.error("Falha ao abrir caixa.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading || !user || checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!caixaAberto) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4">
        <div className={`rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border ${theme.bgCard}`}>
          <div className={`flex items-center gap-2 border-b pb-3 ${theme.borderColor}`}>
            <Lock className="w-5 h-5 text-amber-400" />
            <h3 className={`text-base font-semibold ${theme.textMain}`}>Abertura de Caixa Obrigatória</h3>
          </div>
          <p className={`text-xs ${theme.textMuted}`}>
            Olá, {user.name}. Você não possui um caixa aberto. Informe o fundo de troco para iniciar seu turno
            {hotelName ? ` em ${hotelName}` : ""} e liberar o acesso ao sistema — não é possível usar o app com
            um usuário logado sem caixa aberto.
          </p>
          <div className="space-y-1 text-xs">
            <label className={`font-medium ${theme.textMuted}`}>Fundo de Troco (Dinheiro em Espécie)</label>
            <input
              type="number"
              value={fundoTroco}
              onChange={(e) => setFundoTroco(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAbrirCaixa()}
              placeholder="Ex: 200.00"
              autoFocus
              className={`w-full rounded-lg px-3 py-2 font-mono text-sm border focus:outline-none focus:border-[#10B981] ${theme.isDark ? "bg-[#1E293B] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"}`}
            />
          </div>
          <button
            onClick={handleAbrirCaixa}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-[#10B981] hover:bg-[#0da271] text-white text-sm rounded-lg font-bold disabled:opacity-50"
          >
            {submitting ? "Abrindo..." : "Abrir Caixa e Continuar"}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
