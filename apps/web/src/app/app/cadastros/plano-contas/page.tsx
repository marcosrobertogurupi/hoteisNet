"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BookOpen, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface PlanoConta {
  id: string;
  codigo: string;
  descricao: string;
  tipo: "RECEITA" | "DESPESA";
  nivel: string;
}

export default function PlanoContasPage() {
  const { theme } = useTheme();
  const [plano, setPlano] = useState<PlanoConta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const syncPlanoFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/plano-contas?tenantId=tenant-hoteisnet-demo`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.accounts)) return;

      setPlano((prevList) => {
        const prevMap = new Map(prevList.map((p) => [p.codigo, p]));

        const updatedList: PlanoConta[] = data.accounts.map((a: any) => {
          const code = a.code;
          const desc = a.description;
          const tp = a.type || (code.startsWith("02") ? "RECEITA" : "DESPESA");
          const nv = a.level || (code.endsWith(".00.00") ? "Sintética" : "Analítica");
          const existing = prevMap.get(code);

          if (existing) {
            if (existing.descricao === desc && existing.tipo === tp && existing.nivel === nv) {
              return existing;
            }
            return { ...existing, descricao: desc, tipo: tp, nivel: nv };
          }

          return {
            id: a.id,
            codigo: code,
            descricao: desc,
            tipo: tp,
            nivel: nv,
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[PlanoContas] Erro na sincronização transparente:", err);
    }
  }, []);

  useEffect(() => {
    syncPlanoFromDatabase();
    const interval = setInterval(syncPlanoFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncPlanoFromDatabase]);

  const filteredPlano = plano.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q);
  });

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full font-bold">
            WinDev Win_PlanoContas / Qry_PlanoContas
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
              <BookOpen className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Plano de Contas Gerencial ({plano.length} Contas)</h1>
              <p className="text-xs text-slate-400">Classificação de receitas, despesas e DRE gerencial do hotel (SaaS Multi-tenant).</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por código ou conta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-cyan-500 w-64"
              />
            </div>
            <button className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition">
              <Plus className="w-4 h-4" /> Nova Conta Financeira
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código Estrutural</th>
                <th className="px-5 py-3.5">Descrição da Conta</th>
                <th className="px-5 py-3.5">Natureza (Tipo)</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPlano.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono font-bold text-cyan-400">{p.codigo}</td>
                  <td className="px-5 py-4 font-bold text-white text-sm">{p.descricao}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      p.tipo === "RECEITA" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    }`}>
                      {p.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-cyan-400 hover:bg-cyan-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                      <button className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
