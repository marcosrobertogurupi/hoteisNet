"use client";

import { Cpu, Sparkles, AlertTriangle, ShieldCheck, DollarSign, TrendingUp, BarChart3 } from "lucide-react";

export default function SuperAdminAITelemetryPage() {
  const telemetryByTenant = [
    { tenant: "Pousada Sol & Mar", tokensUsed: 34200, limit: 50000, costUsd: "$ 0.68", status: "NORMAL" },
    { tenant: "Hotel Praia Azul", tokensUsed: 112000, limit: 250000, costUsd: "$ 2.24", status: "NORMAL" },
    { tenant: "Resort Montanha Real", tokensUsed: 185400, limit: 250000, costUsd: "$ 3.70", status: "WARNING" },
    { tenant: "Pousada Cantinho da Serra", tokensUsed: 4100, limit: 15000, costUsd: "$ 0.08", status: "NORMAL" },
    { tenant: "Hotel Central Executivo", tokensUsed: 48900, limit: 50000, costUsd: "$ 0.98", status: "LIMIT_REACHED" },
  ];

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#F59E0B]" />
            Telemetria de Consumo de Inteligência Artificial
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Rastreamento em tempo real de tokens consumidos, custos de API (OpenAI/Gemini) e gestão de cotas por hotel assinante.
          </p>
        </div>

        <div className="px-4 py-2 rounded-xl bg-[#1E293B] border border-slate-800 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-[#F59E0B]" />
          <div>
            <span className="text-xs text-slate-400 block">Custo Total de IA este Mês</span>
            <span className="text-sm font-bold font-mono text-[#10B981]">$ 11.30 USD</span>
          </div>
        </div>
      </div>

      {/* Usage Cards Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#0284C7]">IA Suporte RAG (Embeddings)</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/15 text-[#10B981]">Ativo</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Tokens Consumidos:</span>
              <span className="font-mono text-white font-semibold">680.000</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Requisições:</span>
              <span className="font-mono text-white font-semibold">1.420</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
              <span>Custo em USD:</span>
              <span className="font-mono text-[#10B981] font-semibold">$ 3,40</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#38BDF8]">Pré-Checkin FNRH Preditivo</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/15 text-[#10B981]">Ativo</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Tokens Consumidos:</span>
              <span className="font-mono text-white font-semibold">340.000</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Requisições:</span>
              <span className="font-mono text-white font-semibold">890</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
              <span>Custo em USD:</span>
              <span className="font-mono text-[#10B981] font-semibold">$ 1,70</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F59E0B]">Concierge WhatsApp</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/15 text-[#10B981]">Ativo</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Tokens Consumidos:</span>
              <span className="font-mono text-white font-semibold">1.240.000</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Requisições:</span>
              <span className="font-mono text-white font-semibold">2.150</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400 pt-1 border-t border-slate-800">
              <span>Custo em USD:</span>
              <span className="font-mono text-[#10B981] font-semibold">$ 6,20</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quotas & Tokens Per Tenant Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Consumo e Limite de Cotas de IA por Hotel Assinante</h3>
          <span className="text-xs font-mono text-[#F59E0B]">Cotas Renovadas Mensalmente</span>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
              <th className="p-3.5">HOTEL ASSINANTE</th>
              <th className="p-3.5">TOKENS CONSUMIDOS</th>
              <th className="p-3.5">COTA DO PLANO</th>
              <th className="p-3.5">CUSTO ACUMULADO</th>
              <th className="p-3.5">STATUS DA COTA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {telemetryByTenant.map((row, idx) => {
              const usagePercent = Math.min(100, Math.round((row.tokensUsed / row.limit) * 100));
              return (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3.5 font-semibold text-white">{row.tenant}</td>
                  <td className="p-3.5 font-mono text-slate-200">{row.tokensUsed.toLocaleString()}</td>
                  <td className="p-3.5 font-mono text-slate-400">{row.limit.toLocaleString()}</td>
                  <td className="p-3.5 font-mono text-[#10B981] font-semibold">{row.costUsd}</td>
                  <td className="p-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400">{usagePercent}%</span>
                        {usagePercent >= 95 ? (
                          <span className="text-red-400 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Cota Esgotada
                          </span>
                        ) : usagePercent >= 75 ? (
                          <span className="text-[#F59E0B] font-semibold">Atenção (&gt;75%)</span>
                        ) : (
                          <span className="text-[#10B981]">Normal</span>
                        )}
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            usagePercent >= 95 ? "bg-red-500" : usagePercent >= 75 ? "bg-[#F59E0B]" : "bg-[#10B981]"
                          }`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
