"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  isAdmin: boolean;
}

export interface SessionContextType {
  user: SessionUser | null;
  loading: boolean;
  isAdmin: boolean;
  // true quando /api/auth/me respondeu explicitamente 401 — a sessão foi resolvida como
  // inválida (cookie ausente/expirado, tokenVersion trocado, assinante suspenso — ver
  // getSessionUser). Diferente de uma falha de rede, que mantém loading sem marcar isto.
  sessionInvalid: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionInvalid, setSessionInvalid] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (r.ok) return r.json();
        if (r.status === 401) setSessionInvalid(true);
        return { success: false };
      })
      .then((data) => {
        if (data.success) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <SessionContext.Provider value={{ user, loading, isAdmin: !!user?.isAdmin, sessionInvalid, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextType {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
