"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import LoginForm, { AuthenticatedUser } from "@/components/LoginForm";

// Bloqueio de tela por inatividade. Depois de `screenLockMinutes` (config do assinante, só admin
// altera — ver /api/tenant/settings e a aba Configurações) sem mouse/teclado, encerra a sessão no
// servidor (POST /api/auth/logout) e sobrepõe a tela de login, deixando a tela atual congelada e
// embaçada atrás. Quem autenticar assume o terminal (troca de sessão completa) — inclusive um
// operador diferente do que estava logado, útil para lançamentos de caixa em recepção compartilhada.
//
// Montado em app/layout.tsx, portanto só vale para /app/** (a operação do hotel), nunca /admin/**.

const LOCK_EVENT_KEY = "hoteisnet_screen_lock_event";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart", "scroll"] as const;
const CHECK_INTERVAL_MS = 5000;

export default function InactivityLock() {
  const { user, loading } = useSession();
  const [lockMinutes, setLockMinutes] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const tenantId = user?.tenantId ?? null;

  // Carrega o parâmetro do assinante quando há sessão e recarrega sempre que a tela de
  // Configurações salva (evento "hoteisnet:tenant-settings-updated"). Sem isso, mudar o valor
  // e salvar não tinha efeito até um refresh completo da página — o timer já montado continuava
  // com o valor antigo e chegava a travar a tela mesmo depois de o admin desativar o recurso.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = () => {
      fetch("/api/tenant/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.success) return;
          const m = Number(data.settings?.screenLockMinutes);
          setLockMinutes(Number.isFinite(m) ? m : 0);
        })
        .catch(() => {});
    };

    load();
    window.addEventListener("hoteisnet:tenant-settings-updated", load as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener("hoteisnet:tenant-settings-updated", load as EventListener);
    };
  }, [user]);

  const broadcast = useCallback((type: "lock" | "unlock") => {
    try {
      localStorage.setItem(LOCK_EVENT_KEY, JSON.stringify({ type, t: Date.now() }));
    } catch {
      // localStorage indisponível — o bloqueio ainda funciona nesta aba
    }
  }, []);

  const doLock = useCallback(() => {
    if (lockedRef.current) return;
    setLocked(true);
    // Encerra a sessão no servidor: a tela congelada atrás vira só um retrato, qualquer requisição
    // passa a responder 401.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    broadcast("lock");
  }, [broadcast]);

  // Timer de inatividade + sincronização entre abas.
  useEffect(() => {
    if (!user || !lockMinutes || lockMinutes <= 0) return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, bump, { passive: true, capture: true })
    );

    const thresholdMs = lockMinutes * 60_000;
    const interval = window.setInterval(() => {
      if (!lockedRef.current && Date.now() - lastActivityRef.current >= thresholdMs) {
        doLock();
      }
    }, CHECK_INTERVAL_MS);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCK_EVENT_KEY || !e.newValue) return;
      try {
        const msg = JSON.parse(e.newValue) as { type?: string };
        if (msg.type === "lock") setLocked(true);
        else if (msg.type === "unlock") window.location.reload();
      } catch {
        // ignora mensagem malformada
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump, { capture: true } as any));
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [user, lockMinutes, doLock]);

  // Trava o scroll do body enquanto bloqueado.
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);

  const handleReauth = useCallback(
    async (authUser: AuthenticatedUser): Promise<string | void> => {
      if (tenantId && authUser.tenantId !== tenantId) {
        // Não deixa um usuário de outro estabelecimento assumir este terminal.
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        return "Este usuário não pertence a este estabelecimento.";
      }
      broadcast("unlock");
      window.location.reload();
    },
    [tenantId, broadcast]
  );

  if (loading || !user || !locked) return null;

  return (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4">
      <React.Suspense fallback={null}>
        <LoginForm
          variant="lock"
          headline="Tela bloqueada por inatividade"
          subhead="Entre para continuar. Um operador diferente pode entrar para assumir o terminal."
          onAuthenticated={handleReauth}
        />
      </React.Suspense>
      <p className="absolute bottom-6 left-0 right-0 text-center text-[11px] text-slate-300/80 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        Sessão encerrada automaticamente por inatividade.
      </p>
    </div>
  );
}
