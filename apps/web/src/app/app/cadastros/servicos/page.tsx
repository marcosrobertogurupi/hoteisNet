"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Servico {
  id: string;
  codigo: string;
  descricao: string;
  valor: number;
  tipo: string;
}

const INITIAL_SERVICOS: Servico[] = [
  { id: "SRV-1", codigo: "501", descricao: "Lavanderia - Lavar & Passar Terno Completo", valor: 45.0, tipo: "Terceirizado" },
  { id: "SRV-2", codigo: "502", descricao: "Translado Aeroporto / Hotel (One-way)", valor: 120.0, tipo: "Transporte" },
  { id: "SRV-3", codigo: "503", descricao: "Taxa de Cama Extra por Diária", valor: 50.0, tipo: "Diária Extra" },
  { id: "SRV-4", codigo: "504", descricao: "Estacionamento Coberto por Diária", valor: 30.0, tipo: "Garagem" },
];

export default function ServicosPage() {
  const { theme } = useTheme();
  const [servicos] = useState<Servico[]>(INITIAL_SERVICOS);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = servicos.filter((s) =>
    s.descricao.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.codigo.includes(searchQuery)
  );

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
              <Briefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Serviços Prestados</h1>
              <p className="text-xs text-slate-400">Lavanderia, traslado, passeios e taxas adicionais (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar serviço por descrição ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <span className="text-xs font-mono text-slate-400">Total: <strong className="text-white">{servicos.length}</strong></span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Cód / Serviço</th>
                <th className="px-5 py-3.5">Categoria / Tipo</th>
                <th className="px-5 py-3.5">Valor Unitário</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{s.descricao}</span>
                    <span className="font-mono text-[10px] text-slate-400">Cód: {s.codigo}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-300 font-medium">{s.tipo}</td>
                  <td className="px-5 py-4 font-mono font-bold text-cyan-400">R$ {s.valor.toFixed(2)}</td>
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
