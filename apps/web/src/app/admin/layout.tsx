import Link from "next/link";
import { Users, Activity, Cpu, LifeBuoy, DollarSign, LogOut, Bell, Sparkles } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-[#090D16] overflow-hidden">
      {/* SuperAdmin Sidebar */}
      <aside className="w-64 bg-[#0F172A] border-r border-slate-800 flex flex-col justify-between p-4 z-20">
        <div className="space-y-6">
          {/* Brand Logo SuperAdmin */}
          <div className="flex items-center gap-3 px-2 py-1">
            <img
              src="/brand/icon.png"
              alt="Hoteis.Net"
              className="w-9 h-9 rounded-lg object-contain shadow-md shadow-[#F59E0B]/20"
            />
            <div>
              <span className="font-semibold text-white text-sm tracking-tight block">SuperAdmin SaaS</span>
              <span className="text-[10px] font-mono text-[#F59E0B] bg-[#F59E0B]/15 px-1.5 py-0.5 rounded border border-[#F59E0B]/30">Plataforma Master</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            <Link 
              href="/admin" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>Visão Geral & MRR</span>
            </Link>

            <Link 
              href="/admin" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Assinantes & Hotéis</span>
            </Link>

            <Link 
              href="/admin" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <Cpu className="w-4 h-4" />
              <span>Telemetria & IA Tokens</span>
            </Link>

            <Link 
              href="/admin" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              <span>Planos & Faturamento</span>
            </Link>

            <div className="pt-4 border-t border-slate-800/60 my-2">
              <span className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Suporte Master</span>
              <Link 
                href="/admin" 
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <LifeBuoy className="w-4 h-4 text-[#0284C7]" />
                  <span>Central de Tickets</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#0284C7]/20 text-[#38BDF8]">2 Abertos</span>
              </Link>
            </div>
          </nav>
        </div>

        {/* SuperAdmin Profile */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 flex items-center justify-center text-xs font-bold">
              SA
            </div>
            <div>
              <span className="text-xs font-medium text-white block">Marcos (SuperAdmin)</span>
              <span className="text-[10px] text-[#F59E0B] block font-mono">Master Role</span>
            </div>
          </div>
          <Link href="/" className="text-slate-500 hover:text-red-400 transition-colors p-1.5">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-[#0F172A] border-b border-slate-800 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white tracking-tight">Console de Gestão Global SaaS</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30">
              12 Assinantes Ativos
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-2 rounded-lg bg-slate-800/60 text-slate-300 hover:text-white border border-slate-700/60 transition-colors relative">
              <Bell className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#090D16]">
          {children}
        </main>
      </div>
    </div>
  );
}
