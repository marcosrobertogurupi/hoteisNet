"use client";

import { useState } from "react";
import Link from "next/link";
import { Store, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface PDV {
  id: string;
  codigo: string;
  nome: string;
  localizacao: string;
  operador: string;
  status: "ATIVO" | "INATIVO";
}

const INITIAL_PDVS: PDV[] = [
  { id: "PDV-1", codigo: "PDV-01", nome: "Recepção Central & Front Desk", localizacao: "Lobby Principal", operador: "Marcos (Operador 01)", status: "ATIVO" },
  { id: "PDV-2", codigo: "PDV-02", nome: "Bar da Piscina & Quiosque", localizacao: "Área Externa Lazer", operador: "João Silva", status: "ATIVO" },
  { id: "PDV-3", codigo: "PDV-03", nome: "Restaurante Principal - Buffet", localizacao: "Salão do Restaurante", operador: "Caixa 03", status: "ATIVO" },
];

export default function PDVPage() {
  const { theme } = useTheme();
  const [pdvs] = useState<PDV[]>(INITIAL_PDVS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-2xl">
              <Store className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Pontos de Venda (PDVs)</h1>
              <p className="text-xs text-slate-400">Terminais de atendimento, recepção, bar e restaurante (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-slate-950 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-yellow-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Ponto de Venda (PDV)
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código / Nome do PDV</th>
                <th className="px-5 py-3.5">Localização Física</th>
                <th className="px-5 py-3.5">Operador Atual</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pdvs.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{p.nome}</span>
                    <span className="font-mono text-[10px] text-yellow-400">{p.codigo}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-300 font-medium">{p.localizacao}</td>
                  <td className="px-5 py-4 text-slate-300 font-mono">{p.operador}</td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-yellow-400 hover:bg-yellow-500 hover:text-slate-950 transition"><Edit3 className="w-4 h-4" /></button>
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
