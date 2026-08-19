"use client";

import { useState } from "react";
import Link from "next/link";
import { UtensilsCrossed, Plus, Search, Edit3, Trash2, ArrowLeft } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

interface Prato {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  preco: number;
  descricao: string;
}

const INITIAL_PRATOS: Prato[] = [
  {
    id: "PRT-1",
    codigo: "1001",
    nome: "Filé a Parmegiana Completo",
    categoria: "Pratos Principais",
    preco: 68.0,
    descricao: "Acompanha arroz branco, fritas crocantes e salada verde.",
  },
  {
    id: "PRT-2",
    codigo: "1002",
    nome: "Omelete de Queijo e Presunto (Café da Manhã)",
    categoria: "Café da Manhã / Cozinha",
    preco: 22.0,
    descricao: "Servido quente com torradas amanteigadas.",
  },
  {
    id: "PRT-3",
    codigo: "1003",
    nome: "Caipirinha Tradicional de Limão",
    categoria: "Bar / Drinks",
    preco: 25.0,
    descricao: "Cachaça artesanal, limão taiti e açúcar.",
  },
];

export default function PratosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [pratos] = useState<Prato[]>(INITIAL_PRATOS);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = pratos.filter((p) =>
    p.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.codigo.includes(searchQuery) ||
    p.categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
            isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-700 border-red-200"
          }`}>
            Dados Sincronizados
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"
            }`}>
              <UtensilsCrossed className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Pratos & Cardápio
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Itens de restaurante, porções, refeições e bar (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <button
            onClick={() => toast.info("Formulário de inclusão de Pratos em breve.")}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Prato / Item Cardápio
          </button>
        </div>

        <div className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar prato por nome ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-red-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-red-600"
              }`}
            />
          </div>
          <span className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Cadastrados: <strong className={isDark ? "text-white" : "text-slate-900"}>{pratos.length}</strong>
          </span>
        </div>

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`font-mono border-b uppercase tracking-wider ${
                isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                <tr>
                  <th className="px-5 py-3.5">Código / Prato</th>
                  <th className="px-5 py-3.5">Categoria</th>
                  <th className="px-5 py-3.5">Preço de Venda</th>
                  <th className="px-5 py-3.5">Descrição</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filtered.map((p) => (
                  <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4">
                      <span className={`font-bold text-sm block ${isDark ? "text-white" : "text-slate-900"}`}>{p.nome}</span>
                      <span className={`font-mono text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Cód: {p.codigo}</span>
                    </td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{p.categoria}</td>
                    <td className="px-5 py-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {p.preco.toFixed(2)}
                    </td>
                    <td className={`px-5 py-4 max-w-xs truncate ${isDark ? "text-slate-400" : "text-slate-600"}`}>{p.descricao}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white" : "bg-slate-100 text-red-700 hover:bg-red-600 hover:text-white"
                        }`}>
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                        }`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
