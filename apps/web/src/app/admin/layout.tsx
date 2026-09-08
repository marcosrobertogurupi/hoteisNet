"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Building2, Cpu, DollarSign, LifeBuoy, LogOut, ShieldCheck, UserCog } from "lucide-react";

interface MeUser {
  name: string;
  email: string;
  role: string;
  canEdit: boolean;
}

const NAV = [
  { href: "/admin", label: "Visão Geral & MRR", icon: Activity, exact: true },
  { href: "/admin/tenants", label: "Assinantes & Hotéis", icon: Building2 },
  { href: "/admin/ai-telemetry", label: "Telemetria & IA", icon: Cpu },
  { href: "/admin/support", label: "Suporte", icon: LifeBuoy },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [impersonating, setImpersonating] = useState<{ tenantId: string; tenantName: string } | null>(null);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/admin/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) {
          setMe(d.user);
          setImpersonating(d.impersonating || null);
        } else {
          router.replace("/admin/login");
        }
      })
      .catch(() => {});
  }, [isLoginPage, router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      /* segue para o login mesmo assim */
    }
    router.push("/admin/login");
  };

  const stopImpersonation = async () => {
    try {
      await fetch("/api/admin/impersonation/stop", { method: "POST" });
    } catch {
      /* ignora */
    }
    setImpersonating(null);
  };

  // A tela de login não usa o chrome do painel.
  if (isLoginPage) return <>{children}</>;

  const roleLabel =
    me?.role === "SUPER_ADMIN" ? "Super Admin" : me?.role === "PLATFORM_ADMIN" ? "Admin" : me?.role === "PLATFORM_SUPPORT" ? "Suporte" : me?.role || "";

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 py-1">
            <img src="/brand/icon.png" alt="Hoteis.Net" className="w-9 h-9 rounded-lg object-contain" />
            <div>
              <span className="font-semibold text-slate-900 text-sm tracking-tight block">Painel da Plataforma</span>
              <span className="text-[10px] font-mono text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                Hoteis.Net SaaS
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-sky-50 text-sky-700 border border-sky-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-3 mt-2 border-t border-slate-200">
              <span className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">Financeiro</span>
              <Link
                href="/admin/plans"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin/plans")
                    ? "bg-sky-50 text-sky-700 border border-sky-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Catálogo de Planos</span>
              </Link>
            </div>
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center text-xs font-bold shrink-0">
              {(me?.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-medium text-slate-900 block truncate">{me?.name || "…"}</span>
              <span className="text-[10px] text-sky-700 block font-mono">{roleLabel}</span>
            </div>
          </div>
          <button onClick={handleLogout} title="Sair" className="text-slate-400 hover:text-rose-600 transition-colors p-1.5">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {impersonating && (
          <div className="bg-amber-500 text-amber-950 px-6 py-2 text-xs font-semibold flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <UserCog className="w-4 h-4" /> Você tem uma personificação ativa: <b>{impersonating.tenantName}</b>
            </span>
            <span className="flex items-center gap-3">
              <a href="/app" className="underline hover:no-underline">abrir o sistema do hotel</a>
              <button onClick={stopImpersonation} className="px-2 py-0.5 rounded bg-amber-950 text-amber-50 hover:bg-amber-900">
                encerrar
              </button>
            </span>
          </div>
        )}
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">Console de Gestão da Plataforma</h1>
          {me && !me.canEdit && (
            <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" /> Somente visualização
            </span>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
