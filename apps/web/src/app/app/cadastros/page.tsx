"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Users, 
  Building2, 
  Truck, 
  UserCheck, 
  ShieldCheck, 
  BedDouble, 
  DollarSign, 
  Sparkles, 
  Package, 
  UtensilsCrossed, 
  Briefcase, 
  Store, 
  Tags, 
  Receipt, 
  Landmark,
  CreditCard,
  BookOpen,
  FileText,
  Globe,
  Search,
  ChevronRight,
  ArrowRight,
  Layers,
  Tags as TagsIcon,
  Receipt as ReceivableIcon,
  Wallet
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface CadastroModule {
  id: string;
  title: string;
  description: string;
  icon: any;
  href: string;
  count?: string;
  badge?: string;
  color: string;
}

interface ModuleCategory {
  categoryName: string;
  categoryDesc: string;
  icon: any;
  modules: CadastroModule[];
}

export default function CadastrosHubPage() {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");

  const isDark = theme.isDark;

  const categories: ModuleCategory[] = [
    {
      categoryName: "Pessoas & Parceiros",
      categoryDesc: "Gestão de hóspedes, empresas conveniadas, fornecedores e equipe interna",
      icon: Users,
      modules: [
        {
          id: "hospedes",
          title: "Hóspedes",
          description: "Fichas completas, múltiplos telefones, e-mails, veículos e histórico",
          icon: Users,
          href: "/app/cadastros/hospedes",
          count: "Ficha FNRH Completa",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-sky-50 text-sky-600 border-sky-200",
        },
        {
          id: "empresas",
          title: "Empresas Conveniadas",
          description: "Cadastro corporativo para hospedagem faturada e convênios",
          icon: Building2,
          href: "/app/cadastros/empresas",
          count: "CNPJ / Faturamento",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200",
        },
        {
          id: "fornecedores",
          title: "Fornecedores",
          description: "Cadastro de parceiros de suprimentos e serviços de manutenção",
          icon: Truck,
          href: "/app/cadastros/fornecedores",
          count: "Contas a Pagar",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200",
        },
        {
          id: "colaboradores",
          title: "Colaboradores",
          description: "Equipe de recepção, atendimento, limpeza e gerência",
          icon: UserCheck,
          href: "/app/cadastros/colaboradores",
          count: "Funcionários",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-600 border-purple-200",
        },
        {
          id: "usuarios",
          title: "Usuários do Sistema",
          description: "Controle de acessos, logins de operadores e permissões de caixa",
          icon: ShieldCheck,
          href: "/app/cadastros/usuarios",
          count: "Logins / Níveis",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" : "bg-indigo-50 text-indigo-600 border-indigo-200",
        },
      ],
    },
    {
      categoryName: "Hospedagem & Estrutura",
      categoryDesc: "Quartos, categorias, tarifários e rotinas de governança",
      icon: BedDouble,
      modules: [
        {
          id: "apartamentos",
          title: "Apartamentos / Quartos",
          description: "Cadastro de UH, andares, capacidade de camas e características",
          icon: BedDouble,
          href: "/app/cadastros/apartamentos",
          count: "Mapa de UHs",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-teal-50 text-teal-600 border-teal-200",
        },
        {
          id: "andares",
          title: "Andares do Hotel",
          description: "Pré-cadastro dos andares existentes, usado no cadastro de Apartamentos",
          icon: Layers,
          href: "/app/cadastros/andares",
          count: "Pré-cadastro",
          badge: "Por Assinante",
          color: isDark ? "bg-lime-500/10 text-lime-400 border-lime-500/20" : "bg-lime-50 text-lime-600 border-lime-200",
        },
        {
          id: "categorias-apartamento",
          title: "Categorias de Apartamento",
          description: "Pré-cadastro dos tipos de UH (Standard, Luxo, Suíte...) do hotel",
          icon: TagsIcon,
          href: "/app/cadastros/categorias-apartamento",
          count: "Pré-cadastro",
          badge: "Por Assinante",
          color: isDark ? "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20" : "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200",
        },
        {
          id: "tarifas",
          title: "Tarifas & Períodos",
          description: "Valores de diárias por categoria, hospedagem parcial e pacotes",
          icon: DollarSign,
          href: "/app/tariffs",
          count: "Matriz de Tarifas",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200",
        },
        {
          id: "governanca",
          title: "Governança & Camareiras",
          description: "Status de limpeza, higienização, inspecionado e manutenção",
          icon: Sparkles,
          href: "/app/governance",
          count: "Quartos / Limpeza",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200",
        },
      ],
    },
    {
      categoryName: "Vendas, Produtos & PDV",
      categoryDesc: "Itens de minibar, restaurante, serviços e pontos de venda",
      icon: Package,
      modules: [
        {
          id: "produtos",
          title: "Produtos & Frigobar",
          description: "Cadastro de itens com código de barras, estoque e impostos",
          icon: Package,
          href: "/app/stock",
          count: "Multi-Estoque",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-orange-50 text-orange-600 border-orange-200",
        },
        {
          id: "pratos",
          title: "Pratos & Cardápio",
          description: "Itens de cozinha, porções, bebidas preparadas e fotos",
          icon: UtensilsCrossed,
          href: "/app/cadastros/pratos",
          count: "Cozinha / Bar",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200",
        },
        {
          id: "servicos",
          title: "Serviços Prestados",
          description: "Lavanderia, traslado, passeios e taxas adicionais",
          icon: Briefcase,
          href: "/app/cadastros/servicos",
          count: "Lançamento Rápido",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-cyan-50 text-cyan-600 border-cyan-200",
        },
        {
          id: "pdv",
          title: "Pontos de Venda (PDV)",
          description: "Locais de consumo (Recepção, Bar da Piscina, Restaurante)",
          icon: Store,
          href: "/app/cadastros/pdv",
          count: "Caixas de Consumo",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-amber-50 text-amber-700 border-amber-200",
        },
        {
          id: "grupos",
          title: "Grupos & Categorias",
          description: "Organização de grupos e sub-grupos de produtos e serviços",
          icon: Tags,
          href: "/app/cadastros/grupos",
          count: "Agrupamento",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-slate-500/10 text-slate-400 border-slate-500/20" : "bg-slate-100 text-slate-700 border-slate-200",
        },
        {
          id: "comandas",
          title: "Mesas & Comandas",
          description: "Numeração de mesas do restaurante e comandas avulsas",
          icon: Receipt,
          href: "/app/cadastros/comandas",
          count: "Restaurante",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-pink-500/10 text-pink-400 border-pink-500/20" : "bg-pink-50 text-pink-600 border-pink-200",
        },
      ],
    },
    {
      categoryName: "Financeiro, Tributário & Tabelas",
      categoryDesc: "Bancos, formas de pagamento, plano de contas e impostos fiscais",
      icon: Landmark,
      modules: [
        {
          id: "bancos",
          title: "Bancos & Contas",
          description: "Contas bancárias, carteiras digitais e dados PIX do hotel",
          icon: Landmark,
          href: "/app/cadastros/bancos",
          count: "Conciliação",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200",
        },
        {
          id: "formas-pagto",
          title: "Formas de Pagamento",
          description: "Dinheiro, Cartões Crédito/Débito, PIX, Faturado e Pagar na Saída",
          icon: CreditCard,
          href: "/app/cadastros/formas-pagamento",
          count: "Condições de Pagto",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-violet-500/10 text-violet-400 border-violet-500/20" : "bg-violet-50 text-violet-600 border-violet-200",
        },
        {
          id: "contas-receber",
          title: "Contas a Receber",
          description: "Títulos gerados por formas de pagamento parceladas, com baixa e vencimento",
          icon: ReceivableIcon,
          href: "/app/cadastros/contas-receber",
          count: "Parcelamento",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200",
        },
        {
          id: "contas-pagar",
          title: "Contas a Pagar",
          description: "Títulos de despesas e fornecedores, com plano de contas, vencimento e baixa",
          icon: Wallet,
          href: "/app/cadastros/contas-pagar",
          count: "Financeiro",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200",
        },
        {
          id: "saldo-hospede",
          title: "Saldo do Hóspede",
          description: "Extrato de créditos e débitos do saldo credor do hóspede",
          icon: Wallet,
          href: "/app/cadastros/saldo-hospede",
          count: "Extrato de Saldo",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-sky-50 text-sky-600 border-sky-200",
        },
        {
          id: "plano-contas",
          title: "Plano de Contas",
          description: "Estrutura de receitas, despesas e DRE gerencial",
          icon: BookOpen,
          href: "/app/cadastros/plano-contas",
          count: "Categorias DRE",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-cyan-50 text-cyan-600 border-cyan-200",
        },
        {
          id: "fiscal",
          title: "Fiscal (NCM, CEST, CFOP, CST)",
          description: "Regras tributárias para emissão de NFSe / NFCe / NFe",
          icon: FileText,
          href: "/app/fiscal",
          count: "Impostos & Tributos",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-600 border-amber-200",
        },
        {
          id: "localidades",
          title: "Cidades, Estados & Países",
          description: "Tabela IBGE de municípios, UF e Países cadastrados",
          icon: Globe,
          href: "/app/cadastros/localidades",
          count: "Tabelas IBGE",
          badge: "Dados Sincronizados",
          color: isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-600 border-blue-200",
        },
      ],
    },
  ];

  // Filter modules based on search query
  const filteredCategories = categories.map((cat) => {
    const filteredModules = cat.modules.filter(
      (m) =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.badge?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...cat, modules: filteredModules };
  }).filter((cat) => cat.modules.length > 0);

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto space-y-8">
        <div className={`relative overflow-hidden rounded-3xl p-6 md:p-8 shadow-2xl border ${
          isDark 
            ? "bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-slate-800" 
            : "bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-800 border-slate-700 text-white"
        }`}>
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-0" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                Módulo Base SaaS (Fidelidade Hoteis.Net)
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Central de Cadastros
              </h1>
              <p className="text-slate-300 text-sm md:text-base max-w-2xl leading-relaxed">
                Gerenciamento unificado e isolado por hotel dos cadastros mestres: hóspedes, empresas, fornecedores, apartamentos, tarifários, estoque e parâmetros fiscais.
              </p>
            </div>

            {/* Quick Search */}
            <div className="w-full md:w-80 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar cadastros (ex: Hóspede, NCM)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                  isDark
                    ? "bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500"
                    : "bg-white/90 border border-slate-300 text-slate-900 placeholder-slate-500"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Categories & Cards */}
        <div className="space-y-10">
          {filteredCategories.map((cat, idx) => {
            const CatIcon = cat.icon;

            return (
              <div key={idx} className="space-y-4">
                {/* Category Title */}
                <div className={`flex items-center justify-between border-b pb-3 ${
                  isDark ? "border-slate-800" : "border-slate-200"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl border ${
                      isDark ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
                    }`}>
                      <CatIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                        {cat.categoryName}
                      </h2>
                      <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{cat.categoryDesc}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-mono px-2.5 py-1 rounded-lg border ${
                    isDark ? "bg-slate-800/80 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {cat.modules.length} módulo(s)
                  </span>
                </div>

                {/* Modules Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cat.modules.map((mod) => {
                    const ModIcon = mod.icon;

                    return (
                      <Link
                        key={mod.id}
                        href={mod.href}
                        className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 shadow-md ${
                          isDark
                            ? "bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-indigo-500/40"
                            : "bg-white hover:bg-slate-50 border-slate-200/90 hover:border-indigo-400 shadow-slate-200/50"
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className={`p-3 rounded-xl border ${mod.color}`}>
                              <ModIcon className="w-6 h-6" />
                            </div>
                            {mod.badge && (
                              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                                isDark ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-200 font-semibold"
                              }`}>
                                {mod.badge}
                              </span>
                            )}
                          </div>

                          <div>
                            <h3 className={`text-base font-bold transition-colors flex items-center gap-1.5 ${
                              isDark ? "text-white group-hover:text-indigo-400" : "text-slate-900 group-hover:text-indigo-600"
                            }`}>
                              {mod.title}
                              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-indigo-500" />
                            </h3>
                            <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${
                              isDark ? "text-slate-400" : "text-slate-600"
                            }`}>
                              {mod.description}
                            </p>
                          </div>
                        </div>

                        <div className={`mt-4 pt-3 border-t flex items-center justify-between text-xs ${
                          isDark ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-500"
                        }`}>
                          <span>{mod.count || "Gerenciamento CRUD"}</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline flex items-center gap-1">
                            Acessar <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredCategories.length === 0 && (
            <div className={`text-center py-16 rounded-3xl border space-y-3 ${
              isDark ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <Search className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Nenhum cadastro encontrado</h3>
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Não encontramos nenhum módulo de cadastro para a busca &quot;{searchQuery}&quot;.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
