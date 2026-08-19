"use client";

import { useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import CashRegisterGate from "@/components/CashRegisterGate";
import { Settings, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useOperator } from "@/context/OperatorContext";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  TENANT_ADMIN: "Administrador",
  RECEPCIONIST: "Recepção",
  GOVERNESS: "Governança",
  FINANCIAL: "Financeiro",
};

export default function TenantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const pathname = usePathname();
  const { user } = useSession();
  const { setOperator } = useOperator();
  const isSettingsPage = pathname?.startsWith("/app/settings");
  const displayName = user?.name || "";
  const roleLabel = user ? (ROLE_LABELS[user.role] || user.role) : "";

  // O operador ativo (usado nos lançamentos de caixa) é sempre o usuário realmente logado.
  // Sincronizado aqui no layout raiz (e não só na Sidebar) para já estar correto quando o
  // CashRegisterGate faz sua checagem, mesmo antes da Sidebar montar.
  useEffect(() => {
    if (user) setOperator(user.id, user.name);
  }, [user, setOperator]);

  return (
    <CashRegisterGate>
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain}`}>
      {/* Retractable Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className={`h-16 px-6 flex items-center justify-between border-b transition-colors print:hidden ${theme.bgHeader}`}>
          <div className="flex items-center gap-4">
            <img
              src="/brand/icon.png"
              alt="Hoteis.Net"
              className="w-8 h-8 rounded-lg object-contain shrink-0"
            />
            <h1 className="text-lg font-semibold tracking-tight">Hoteis.Net SaaS que trabalha por você</h1>
            {isSettingsPage && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono ${theme.badgeBg}`}>
                WhatsApp Uazapi: Conectado
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {displayName && (
              <div className="flex items-center gap-2 pr-1">
                <div className="w-8 h-8 rounded-full bg-[#0284C7] text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {displayName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="text-right leading-tight hidden sm:block">
                  <p className="text-sm font-semibold">{displayName}</p>
                  {roleLabel && <p className={`text-xs ${theme.isDark ? "text-slate-400" : "text-slate-500"}`}>{roleLabel}</p>}
                </div>
              </div>
            )}
            <button className={`p-2 rounded-lg transition-colors relative border ${theme.isDark ? "bg-slate-800/60 text-slate-300 hover:text-white border-slate-700/60" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"}`}>
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#0284C7]" />
            </button>
            <Link
              href="/app/settings"
              className={`p-2 rounded-lg transition-colors border ${theme.isDark ? "bg-slate-800/60 text-slate-300 hover:text-white border-slate-700/60" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"}`}
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {/* Page View Area */}
        <main className={`flex-1 overflow-y-auto p-6 transition-colors ${theme.bgApp}`}>
          {children}
        </main>
      </div>
    </div>
    </CashRegisterGate>
  );
}
