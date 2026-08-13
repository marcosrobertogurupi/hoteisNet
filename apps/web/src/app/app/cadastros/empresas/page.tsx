"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Building2, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Phone, 
  Mail, 
  ArrowLeft
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import CadastroEmpresaModal, { EmpresaFormData } from "@/components/CadastroEmpresaModal";

export default function EmpresasPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [empresas, setEmpresas] = useState<EmpresaFormData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<EmpresaFormData | null>(null);

  const syncEmpresasFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/empresas`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.companies)) return;

      setEmpresas((prevList) => {
        const prevMap = new Map(prevList.map((e) => [e.id, e]));

        const updatedList: EmpresaFormData[] = data.companies.map((c: any) => {
          const existing = prevMap.get(c.id);
          const rName = c.name;
          const tName = c.tradeName || c.name;
          const cnpjStr = c.cnpj || "Sem CNPJ";
          const ph = c.phone || "";
          const em = c.email || "";

          if (existing) {
            if (existing.razao === rName && existing.cnpj === cnpjStr) {
              return existing;
            }
            return { ...existing, razao: rName, fantasia: tName, cnpj: cnpjStr };
          }

          return {
            id: c.id,
            cnpj: cnpjStr,
            razao: rName,
            fantasia: tName,
            ie: "ISENTO",
            cep: "77400-000",
            logradouro: c.address || "Centro",
            numero: "100",
            bairro: "Centro",
            cidade: c.city || "Gurupi",
            uf: c.state || "TO",
            telefones: ph ? [{ telefone: ph, descricao: "Comercial", telPrincipal: true }] : [],
            emails: em ? [{ email: em, emailPrincipal: true }] : [],
            observacao: `Prazo de Pagamento: ${c.paymentTerms || 15} dias.`,
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[CadastroEmpresas] Erro na sincronização transparente:", err);
    }
  }, []);

  useEffect(() => {
    syncEmpresasFromDatabase();
    const interval = setInterval(syncEmpresasFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncEmpresasFromDatabase]);

  const filteredEmpresas = empresas.filter((emp) =>
    emp.razao.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.fantasia.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.cnpj.includes(searchQuery) ||
    emp.cidade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingEmpresa(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: EmpresaFormData) => {
    setEditingEmpresa(emp);
    setIsModalOpen(true);
  };

  const handleDelete = (id?: string) => {
    if (!id) return;
    if (confirm("Tem certeza que deseja excluir esta empresa conveniada?")) {
      setEmpresas((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const handleSaveEmpresa = (data: EmpresaFormData) => {
    if (data.id) {
      setEmpresas((prev) => prev.map((e) => (e.id === data.id ? data : e)));
    } else {
      const newEmp: EmpresaFormData = {
        ...data,
        id: `EMP-${Math.floor(100 + Math.random() * 900)}`,
      };
      setEmpresas((prev) => [newEmp, ...prev]);
    }
    setIsModalOpen(false);
  };

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
            isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
          }`}>
            WinDev Win_VisAltCadEmpresa / Faturamento
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600"
            }`}>
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Empresas Conveniadas
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Gerenciamento corporativo, faturamento faturado e convênios especiais (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nova Empresa Conveniada
          </button>
        </div>

        <div className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Razão Social, CNPJ ou Cidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-blue-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600"
              }`}
            />
          </div>

          <span className={`text-xs font-mono hidden md:inline-block ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Empresas cadastradas: <strong className={isDark ? "text-white" : "text-slate-900"}>{empresas.length}</strong>
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
                  <th className="px-5 py-3.5">Empresa / CNPJ</th>
                  <th className="px-5 py-3.5">Nome Fantasia / IE</th>
                  <th className="px-5 py-3.5">Cidade / Sede</th>
                  <th className="px-5 py-3.5">Contatos Comerciais</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filteredEmpresas.map((emp) => {
                  const mainTel = emp.telefones[0];
                  const mainEmail = emp.emails[0];

                  return (
                    <tr key={emp.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <span className={`font-bold text-sm block ${isDark ? "text-white" : "text-slate-900"}`}>{emp.razao}</span>
                          <span className={`font-mono text-[11px] px-2 py-0.5 rounded border inline-block ${
                            isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            CNPJ: {emp.cnpj || "Sem CNPJ"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{emp.fantasia || "-"}</span>
                          <span className={`text-[10px] block font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>IE: {emp.ie || "Isento"}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{emp.cidade || "-"}</span>
                          <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>{emp.uf}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {mainTel && (
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <Phone className="w-3.5 h-3.5 text-emerald-500" /> {mainTel.telefone}
                            </div>
                          )}
                          {mainEmail && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Mail className="w-3.5 h-3.5 text-sky-500" /> {mainEmail.email}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            title="Editar Empresa"
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white" : "bg-slate-100 text-blue-700 hover:bg-blue-600 hover:text-white"
                            }`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(emp.id)}
                            title="Excluir Empresa"
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredEmpresas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 space-y-2">
                      <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma empresa encontrada</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CadastroEmpresaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEmpresa}
        initialData={editingEmpresa}
      />
    </div>
  );
}
