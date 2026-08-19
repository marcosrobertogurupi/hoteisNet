"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface FormaPagto {
  id: string;
  codigo: string;
  descricao: string;
  tipo: "DINHEIRO" | "PIX" | "CREDITO" | "DEBITO" | "FATURADO" | "VOUCHER";
  taxaPercent: number;
  diasRecebimento: number;
}

const INITIAL_FORMAS: FormaPagto[] = [
  { id: "FPG-1", codigo: "01", descricao: "Dinheiro em Espécie (Espécie)", tipo: "DINHEIRO", taxaPercent: 0, diasRecebimento: 0 },
  { id: "FPG-2", codigo: "02", descricao: "PIX Transferência Instantânea (QRCode)", tipo: "PIX", taxaPercent: 0, diasRecebimento: 0 },
  { id: "FPG-3", codigo: "03", descricao: "Cartão de Crédito à Vista (1x)", tipo: "CREDITO", taxaPercent: 2.5, diasRecebimento: 30 },
  { id: "FPG-4", codigo: "04", descricao: "Cartão de Débito (Visa/Master)", tipo: "DEBITO", taxaPercent: 1.2, diasRecebimento: 1 },
  { id: "FPG-5", codigo: "05", descricao: "Faturado Empresa Conveniada (30 dias)", tipo: "FATURADO", taxaPercent: 0, diasRecebimento: 30 },
];

export default function FormasPagamentoPage() {
  const { theme } = useTheme();
  const [formas] = useState<FormaPagto[]>(INITIAL_FORMAS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-2xl">
              <CreditCard className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Formas de Pagamento</h1>
              <p className="text-xs text-slate-400">Condições financeiras de recebimento em caixa, taxas e prazos de liquidação (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-500/20 transition">
            <Plus className="w-4 h-4" /> Nova Forma de Pagamento
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Cód / Descrição</th>
                <th className="px-5 py-3.5">Tipo Financeiro</th>
                <th className="px-5 py-3.5">Taxa de Operação (%)</th>
                <th className="px-5 py-3.5">Prazo Liquidação</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {formas.map((f) => (
                <tr key={f.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{f.descricao}</span>
                    <span className="font-mono text-[10px] text-violet-400">Cód: {f.codigo}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
                      {f.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-amber-400">{f.taxaPercent}%</td>
                  <td className="px-5 py-4 font-mono text-slate-300">
                    {f.diasRecebimento === 0 ? "Imediato (D+0)" : `D+${f.diasRecebimento} dias`}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-violet-400 hover:bg-violet-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
