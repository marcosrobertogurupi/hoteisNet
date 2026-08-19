"use client";

import { useState } from "react";
import Link from "next/link";
import { UserCheck, Plus, Search, Edit3, Trash2, ArrowLeft, Phone, Mail } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  cpf: string;
  telefone: string;
  email: string;
  status: "ATIVO" | "INATIVO";
}

const INITIAL_COLABORADORES: Colaborador[] = [
  { id: "COL-1", nome: "ALESSANDRA SOUZA", cargo: "Recepcionista Chefe", cpf: "111.222.333-44", telefone: "(61) 98877-6655", email: "alessandra@hotel.com.br", status: "ATIVO" },
  { id: "COL-2", nome: "MARIA DAS GRACAS", cargo: "Camareira Líder", cpf: "222.333.444-55", telefone: "(61) 99988-7766", email: "governanca@hotel.com.br", status: "ATIVO" },
  { id: "COL-3", nome: "JOSE ROBERTO FERREIRA", cargo: "Gerente Geral", cpf: "333.444.555-66", telefone: "(61) 97766-5544", email: "gerencia@hotel.com.br", status: "ATIVO" },
];

export default function ColaboradoresPage() {
  const { theme } = useTheme();
  const [colaboradores] = useState<Colaborador[]>(INITIAL_COLABORADORES);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-2xl">
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Colaboradores</h1>
              <p className="text-xs text-slate-400">Funcionários da recepção, cozinha, governança e administração (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Colaborador
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Nome / CPF</th>
                <th className="px-5 py-3.5">Cargo / Função</th>
                <th className="px-5 py-3.5">Telefone / E-mail</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {colaboradores.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4">
                    <span className="font-bold text-white text-sm block">{c.nome}</span>
                    <span className="font-mono text-[10px] text-purple-400">CPF: {c.cpf}</span>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-200">{c.cargo}</td>
                  <td className="px-5 py-4 font-mono text-slate-300">
                    <div>{c.telefone}</div>
                    <div className="text-[10px] text-slate-400">{c.email}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-purple-400 hover:bg-purple-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
