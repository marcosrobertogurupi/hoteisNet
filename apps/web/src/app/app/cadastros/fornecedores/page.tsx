"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Truck, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Phone, 
  Mail, 
  ArrowLeft
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import CadastroFornecedorModal, { FornecedorFormData } from "@/components/CadastroFornecedorModal";

export default function FornecedoresPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();

  const [fornecedores, setFornecedores] = useState<FornecedorFormData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<FornecedorFormData | null>(null);

  const syncFornecedoresFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cadastros/fornecedores`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.suppliers)) return;

      setFornecedores((prevList) => {
        const prevMap = new Map(prevList.map((f) => [f.id, f]));

        const updatedList: FornecedorFormData[] = data.suppliers.map((s: any) => {
          const existing = prevMap.get(s.id);
          const rName = s.name;
          const tName = s.tradeName || s.name;
          const cCpf = s.cnpj || "Sem CNPJ";
          const ph = s.phone || "";
          const em = s.email || "";

          if (existing) {
            if (existing.razao === rName && existing.cnpjCpf === cCpf && existing.telefone === ph) {
              return existing;
            }
            return { ...existing, razao: rName, fantasia: tName, cnpjCpf: cCpf, telefone: ph, email: em };
          }

          return {
            id: s.id,
            cnpjCpf: cCpf,
            razao: rName,
            fantasia: tName,
            ie: "ISENTO",
            cep: "77400-000",
            logradouro: s.address || "Centro",
            numero: "100",
            bairro: "Centro",
            cidade: s.city || "Gurupi",
            uf: s.state || "TO",
            telefone: ph,
            email: em,
            observacao: s.category ? `Categoria: ${s.category}` : "Fornecedor ativo.",
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[CadastroFornecedores] Erro na sincronização transparente:", err);
    }
  }, []);

  useEffect(() => {
    syncFornecedoresFromDatabase();
    const interval = setInterval(syncFornecedoresFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncFornecedoresFromDatabase]);

  const filteredFornecedores = fornecedores.filter((f) =>
    f.razao.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.fantasia.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.cnpjCpf.includes(searchQuery) ||
    f.cidade.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingFornecedor(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (f: FornecedorFormData) => {
    setEditingFornecedor(f);
    setIsModalOpen(true);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const ok = await confirmDialog({
      title: "Excluir Fornecedor",
      message: "Tem certeza que deseja excluir este fornecedor?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (ok) {
      setFornecedores((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleSaveFornecedor = (data: FornecedorFormData) => {
    if (data.id) {
      setFornecedores((prev) => prev.map((f) => (f.id === data.id ? data : f)));
    } else {
      const newF: FornecedorFormData = {
        ...data,
        id: `FOR-${Math.floor(100 + Math.random() * 900)}`,
      };
      setFornecedores((prev) => [newF, ...prev]);
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
            isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            WinDev Win_Fornecedores
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-600"
            }`}>
              <Truck className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Fornecedores
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Parceiros de estoque, insumos e manutenção (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Fornecedor
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
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-emerald-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-600"
              }`}
            />
          </div>

          <span className={`text-xs font-mono hidden md:inline-block ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Total fornecedores: <strong className={isDark ? "text-white" : "text-slate-900"}>{fornecedores.length}</strong>
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
                  <th className="px-5 py-3.5">Fornecedor / CNPJ</th>
                  <th className="px-5 py-3.5">Nome Fantasia</th>
                  <th className="px-5 py-3.5">Cidade / UF</th>
                  <th className="px-5 py-3.5">Telefone / E-mail</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filteredFornecedores.map((f) => (
                  <tr key={f.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4">
                      <div className="space-y-0.5">
                        <span className={`font-bold text-sm block ${isDark ? "text-white" : "text-slate-900"}`}>{f.razao}</span>
                        <span className={`font-mono text-[11px] px-2 py-0.5 rounded border inline-block ${
                          isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}>
                          CNPJ: {f.cnpjCpf || "Sem CNPJ"}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{f.fantasia || "-"}</span>
                    </td>

                    <td className="px-5 py-4">
                      <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{f.cidade || "-"}</span>
                      <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>{f.uf}</span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        {f.telefone && (
                          <div className="flex items-center gap-1.5 font-mono text-[11px]">
                            <Phone className="w-3.5 h-3.5 text-emerald-500" /> {f.telefone}
                          </div>
                        )}
                        {f.email && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Mail className="w-3.5 h-3.5 text-sky-500" /> {f.email}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(f)}
                          title="Editar Fornecedor"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white" : "bg-slate-100 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(f.id)}
                          title="Excluir Fornecedor"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredFornecedores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 space-y-2">
                      <Truck className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhum fornecedor encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CadastroFornecedorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveFornecedor}
        initialData={editingFornecedor}
      />
    </div>
  );
}
