"use client";

import { useEffect, useState } from "react";
import { UserCog, LogOut } from "lucide-react";

// Faixa fixa no topo do app do assinante quando a sessão atual é uma personificação da equipe da
// plataforma ("entrar como assinante", ver /api/admin/tenants/[id]/impersonate). Deixa explícito
// que quem está ali não é o próprio hotel, e dá o botão de sair.
export default function ImpersonationBanner() {
  const [state, setState] = useState<{ tenantName: string | null; actorName: string | null } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/impersonation")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.impersonating) setState({ tenantName: d.tenantName, actorName: d.actorName });
      })
      .catch(() => {});
  }, []);

  if (!state) return null;

  const leave = async () => {
    setLeaving(true);
    try {
      const res = await fetch("/api/admin/impersonation/stop", { method: "POST" });
      const d = await res.json();
      window.location.href = d?.redirectTo || "/admin/tenants";
    } catch {
      window.location.href = "/admin/tenants";
    }
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-3 print:hidden">
      <UserCog className="w-4 h-4 shrink-0" />
      <span>
        Você está vendo o sistema como <b>{state.tenantName}</b>
        {state.actorName ? ` (personificação por ${state.actorName})` : ""}. Alterações feitas aqui são reais.
      </span>
      <button
        onClick={leave}
        disabled={leaving}
        className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950 text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        <LogOut className="w-3 h-3" /> Sair da personificação
      </button>
    </div>
  );
}
