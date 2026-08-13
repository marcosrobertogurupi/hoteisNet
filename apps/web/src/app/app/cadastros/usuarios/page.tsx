"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Plus, Search, Edit3, Trash2, ArrowLeft, Key } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface Usuario {
  id: string;
  login: string;
  nome: string;
  perfil: "ADMIN" | "OPERADOR" | "RECEPCAO" | "CAIXA";
  ultimoAcesso: string;
}

const INITIAL_USUARIOS: Usuario[] = [
  { id: "USU-1", login: "MARCOS", nome: "Marcos (Administrador Geral)", perfil: "ADMIN", ultimoAcesso: "Hoje às 11:32" },
  { id: "USU-2", login: "RECEPCAO01", nome: "Recepção Manhã", perfil: "RECEPCAO", ultimoAcesso: "Hoje às 08:00" },
  { id: "USU-3", login: "CAIXA01", nome: "Operador de Caixa", perfil: "CAIXA", ultimoAcesso: "Ontem às 22:15" },
];

export default function UsuariosPage() {
  const { theme } = useTheme();
  const [usuarios] = useState<Usuario[]>(INITIAL_USUARIOS);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full font-bold">
            WinDev Win_Usuarios / Win_IncluirUsuario
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Usuários & Permissões de Acesso</h1>
              <p className="text-xs text-slate-400">Operadores do sistema, perfis de permissão e auditoria (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Login de Acesso</th>
                <th className="px-5 py-3.5">Nome do Usuário</th>
                <th className="px-5 py-3.5">Perfil de Acesso</th>
                <th className="px-5 py-3.5">Último Acesso Registrado</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-5 py-4 font-mono font-bold text-indigo-400">{u.login}</td>
                  <td className="px-5 py-4 font-bold text-white text-sm">{u.nome}</td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-indigo-300 font-mono text-[10px] font-bold">
                      {u.perfil}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-400 font-mono">{u.ultimoAcesso}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 rounded-xl bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
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
