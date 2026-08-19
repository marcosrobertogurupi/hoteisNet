"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, Plus, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface MesaComanda {
  id: string;
  numero: string;
  descricao: string;
  tipo: "MESA" | "COMANDA_AVULSA";
  status: "LIVRE" | "ABERTA";
}

const INITIAL_MESAS: MesaComanda[] = [
  { id: "M-01", numero: "01", descricao: "Mesa 01 - Salão Interno Ar", tipo: "MESA", status: "LIVRE" },
  { id: "M-02", numero: "02", descricao: "Mesa 02 - Salão Interno Ar", tipo: "MESA", status: "LIVRE" },
  { id: "M-03", numero: "03", descricao: "Mesa 03 - Varanda Piscina", tipo: "MESA", status: "ABERTA" },
  { id: "C-100", numero: "100", descricao: "Comanda Cartão Avulso #100", tipo: "COMANDA_AVULSA", status: "LIVRE" },
];

export default function ComandasPage() {
  const { theme } = useTheme();
  const [mesas] = useState<MesaComanda[]>(INITIAL_MESAS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-pink-500/10 text-pink-400 border border-pink-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-2xl">
              <Receipt className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Mesas & Comandas</h1>
              <p className="text-xs text-slate-400">Restaurante, bar da piscina e comandas avulsas (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Mesa / Comanda
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Número / Identificador</th>
                <th className="px-5 py-3.5">Descrição / Localização</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {mesas.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono font-bold text-white text-base">
                    Nº {m.numero}
                  </td>
                  <td className="px-5 py-4 text-slate-300 font-medium">{m.descricao}</td>
                  <td className="px-5 py-4 font-mono text-slate-400">{m.tipo}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === "LIVRE" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-pink-400 hover:bg-pink-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
