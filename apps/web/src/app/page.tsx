import Link from "next/link";
import { Hotel, ShieldCheck, MessageSquareText, FileText, Sparkles, ArrowRight, Building2, UserCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#090D16] flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Background Subtle Glow Effects */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#0284C7]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-[#10B981]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <img
            src="/brand/icon.png"
            alt="Hoteis.Net"
            className="w-10 h-10 rounded-xl object-contain shadow-lg shadow-[#0284C7]/20"
          />
          <div>
            <span className="text-xl font-bold tracking-tight text-white">Hoteis.Net <span className="text-[#0284C7] text-xs px-2 py-0.5 rounded-full bg-[#0284C7]/15 border border-[#0284C7]/30">SaaS</span></span>
            <p className="text-xs text-slate-400">Plataforma Cloud PMS Hoteleira</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link 
            href="/app" 
            className="px-4 py-2 text-sm font-medium text-slate-200 hover:text-white transition-colors"
          >
            Acesso Assinantes
          </Link>
          <Link 
            href="/admin" 
            className="px-4 py-2 text-sm font-medium bg-[#1E293B] hover:bg-[#334155] text-slate-200 rounded-lg border border-slate-700/60 transition-colors flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
            Portal SuperAdmin
          </Link>
        </div>
      </header>

      {/* Hero Content */}
      <main className="my-auto py-12 z-10 max-w-5xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0F172A] border border-slate-800 text-xs font-medium text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span>FNRH Digital Legal + Automação Uazapi WhatsApp + IA Autônoma</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-tight">
          Gestão Hoteleira Completa,<br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#10B981]">
            Inteligente e Multi-Tenant
          </span>
        </h1>

        <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Modernização do sistema WinDev Hoteis.Net para a nuvem. Mapa Gantt interativo de quartos,
          FNRH com assinatura digital Touch, faturamento corporativo para empresas e IA de suporte.
        </p>

        {/* Portal Access Buttons */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto pt-6 text-left">
          {/* Tenant Portal Card */}
          <Link href="/app" className="group p-6 rounded-2xl bg-[#0F172A] border border-slate-800 hover:border-[#0284C7]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#0284C7]/10 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#0284C7]/15 border border-[#0284C7]/30 flex items-center justify-center text-[#0284C7] group-hover:scale-110 transition-transform">
                <Hotel className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white group-hover:text-[#38BDF8] transition-colors flex items-center justify-between">
                  Portal do Assinante
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-[#38BDF8] group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  Acesso para Hotéis e Pousadas. Gestão de Reservas, Mapa de Quartos, Check-in FNRH, Governança, Consumo e Suporte IA.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Ambiente Operacional PMS</span>
              <span className="font-mono text-[#10B981]">app.hoteisnet.com</span>
            </div>
          </Link>

          {/* SuperAdmin Portal Card */}
          <Link href="/admin" className="group p-6 rounded-2xl bg-[#0F172A] border border-slate-800 hover:border-[#F59E0B]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#F59E0B]/10 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white group-hover:text-[#F59E0B] transition-colors flex items-center justify-between">
                  Portal SuperAdmin SaaS
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-[#F59E0B] group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  Gestão global de clientes assinantes, controle de faturamento MRR/ARR, telemetria de consumo de IA e Central de Suporte Master.
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Console de Gestão SaaS</span>
              <span className="font-mono text-[#F59E0B]">admin.hoteisnet.com</span>
            </div>
          </Link>
        </div>
      </main>

      {/* Feature Badges */}
      <footer className="z-10 border-t border-slate-800/60 pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-center text-xs text-slate-400">
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4 text-[#10B981]" />
            <span>FNRH Digital & SNRHos Legal</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <MessageSquareText className="w-4 h-4 text-[#0284C7]" />
            <span>Automação WhatsApp Uazapi</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Building2 className="w-4 h-4 text-[#38BDF8]" />
            <span>Faturamento Empresarial</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <UserCheck className="w-4 h-4 text-[#F59E0B]" />
            <span>Busca CPF (Hub Dev)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
