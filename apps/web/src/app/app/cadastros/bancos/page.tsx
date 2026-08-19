"use client";

import { useState } from "react";
import Link from "next/link";
import { Landmark, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Banco {
  id: string;
  codigoCompe: string;
  nomeBanco: string;
  agencia: string;
  conta: string;
  chavePix: string;
}

const INITIAL_BANCOS: Banco[] = [
  { id: "BNC-1", codigoCompe: "001", nomeBanco: "Banco do Brasil S.A.", agencia: "1234-5", conta: "98765-4", chavePix: "financeiro@hotel.com.br" },
  { id: "BNC-2", codigoCompe: "341", nomeBanco: "Itaú Unibanco S.A.", agencia: "0456", conta: "12345-6", chavePix: "+5561999998888" },
  { id: "BNC-3", codigoCompe: "260", nomeBanco: "Nu Pagamentos (NuBank)", agencia: "0001", conta: "887766-5", chavePix: "33.000.167/0001-01" },
];

export default function BancosPage() {
  const { theme } = useTheme();
  const [bancos] = useState<Banco[]>(INITIAL_BANCOS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
              <Landmark className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Bancos & Contas</h1>
              <p className="text-xs text-slate-400">Contas bancárias do hotel, agências, contas e chaves PIX de recebimento (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Conta Bancária / PIX
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">COMPE / Banco</th>
                <th className="px-5 py-3.5">Agência & Conta</th>
                <th className="px-5 py-3.5">Chave PIX de Recebimento</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {bancos.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{b.nomeBanco}</span>
                    <span className="font-mono text-[10px] text-emerald-400">Código COMPE: {b.codigoCompe}</span>
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-200">
                    Ag: {b.agencia} | C/C: {b.conta}
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-300">
                    <span className="bg-slate-800 px-2.5 py-1 rounded text-sky-400 border border-slate-700">
                      {b.chavePix}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
