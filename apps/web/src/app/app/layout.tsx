"use client";

import Sidebar from "@/components/Sidebar";
import { Settings, Bell } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";

export default function TenantAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain}`}>
      {/* Retractable Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className={`h-16 px-6 flex items-center justify-between border-b transition-colors print:hidden ${theme.bgHeader}`}>
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight">HoteisNet PMS SaaS Operacional</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono ${theme.badgeBg}`}>
              WhatsApp Uazapi: Conectado
            </span>
          </div>

          <div className="flex items-center gap-3">
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
  );
}
