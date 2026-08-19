"use client";

import { useState } from "react";
import Link from "next/link";
import { Tags, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Grupo {
  id: string;
  codigo: string;
  nome: string;
  tipo: "PRODUTO" | "SERVICO" | "PRATO";
}

const INITIAL_GRUPOS: Grupo[] = [
  { id: "GRP-1", codigo: "01", nome: "Bebidas & Refrigerantes", tipo: "PRODUTO" },
  { id: "GRP-2", codigo: "02", nome: "Itens de Frigobar", tipo: "PRODUTO" },
  { id: "GRP-3", codigo: "03", nome: "Restaurante - Porções & Petiscos", tipo: "PRATO" },
  { id: "GRP-4", codigo: "04", nome: "Serviços de Lavanderia", tipo: "SERVICO" },
];

export default function GruposPage() {
  const { theme } = useTheme();
  const [grupos] = useState<Grupo[]>(INITIAL_GRUPOS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-slate-500/10 border border-slate-500/20 text-slate-400 rounded-2xl">
              <Tags className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Grupos & Categorias</h1>
              <p className="text-xs text-slate-400">Classificação e agrupamento de itens de estoque, pratos e serviços (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg transition">
            <Plus className="w-4 h-4" /> Novo Grupo
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Cód / Nome do Grupo</th>
                <th className="px-5 py-3.5">Tipo de Destino</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {grupos.map((g) => (
                <tr key={g.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{g.nome}</span>
                    <span className="font-mono text-[10px] text-slate-400">Cód: {g.codigo}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
                      {g.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
