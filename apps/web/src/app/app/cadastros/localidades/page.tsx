"use client";

import { useState } from "react";
import Link from "next/link";
import { Globe, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Localidade {
  id: string;
  codigoIbge: string;
  cidade: string;
  uf: string;
  pais: string;
}

const INITIAL_LOCALIDADES: Localidade[] = [
  { id: "LOC-1", codigoIbge: "5300108", cidade: "Brasília", uf: "DF", pais: "Brasil" },
  { id: "LOC-2", codigoIbge: "3106200", cidade: "Belo Horizonte", uf: "MG", pais: "Brasil" },
  { id: "LOC-3", codigoIbge: "3550308", cidade: "São Paulo", uf: "SP", pais: "Brasil" },
  { id: "LOC-4", codigoIbge: "3304557", cidade: "Rio de Janeiro", uf: "RJ", pais: "Brasil" },
];

export default function LocalidadesPage() {
  const { theme } = useTheme();
  const [localidades] = useState<Localidade[]>(INITIAL_LOCALIDADES);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl">
              <Globe className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Tabela de Cidades, UFs & Países</h1>
              <p className="text-xs text-slate-400">Tabela oficial IBGE para emissão fiscal e FNRH (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Cidade / Município
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Código IBGE</th>
                <th className="px-5 py-3.5">Cidade / Município</th>
                <th className="px-5 py-3.5">UF / Estado</th>
                <th className="px-5 py-3.5">País</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {localidades.map((l) => (
                <tr key={l.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono text-blue-400 font-bold">{l.codigoIbge}</td>
                  <td className="px-5 py-4 font-bold text-white text-sm">{l.cidade}</td>
                  <td className="px-5 py-4 font-mono text-slate-300">{l.uf}</td>
                  <td className="px-5 py-4 text-slate-300">{l.pais}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
