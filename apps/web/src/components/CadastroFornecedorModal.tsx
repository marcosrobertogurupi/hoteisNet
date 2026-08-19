"use client";

import { useState, useEffect } from "react";
import { X, Truck, MapPin, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";

export interface FornecedorFormData {
  id?: string;
  cnpjCpf: string;
  razao: string;
  fantasia: string;
  ie: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
  email: string;
  observacao: string;
}

interface CadastroFornecedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FornecedorFormData) => void;
  initialData?: FornecedorFormData | null;
}

export default function CadastroFornecedorModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CadastroFornecedorModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [formData, setFormData] = useState<FornecedorFormData>({
    cnpjCpf: "",
    razao: "",
    fantasia: "",
    ie: "",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    telefone: "",
    email: "",
    observacao: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        cnpjCpf: "",
        razao: "",
        fantasia: "",
        ie: "",
        cep: "",
        logradouro: "",
        numero: "",
        bairro: "",
        cidade: "",
        uf: "",
        telefone: "",
        email: "",
        observacao: "",
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.razao.trim()) {
      toast.warning("Por favor, preencha o Nome/Razão Social do Fornecedor.");
      return;
    }
    onSave(formData);
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-emerald-600 shadow-sm";

  const subInputClass = isDark
    ? "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-600"
            }`}>
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {initialData ? "Editar Fornecedor" : "Novo Cadastro de Fornecedor"}
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Cadastro de Fornecedor
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CNPJ / CPF</label>
              <input
                type="text"
                placeholder="00.000.000/0000-00"
                value={formData.cnpjCpf}
                onChange={(e) => setFormData({ ...formData, cnpjCpf: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Razão Social / Nome <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Ambev S.A. Distribuidora"
                value={formData.razao}
                onChange={(e) => setFormData({ ...formData, razao: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nome Fantasia</label>
              <input
                type="text"
                placeholder="Ex: Ambev Bebidas"
                value={formData.fantasia}
                onChange={(e) => setFormData({ ...formData, fantasia: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Inscrição Estadual (IE)</label>
              <input
                type="text"
                placeholder="Isento ou Nº"
                value={formData.ie}
                onChange={(e) => setFormData({ ...formData, ie: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          {/* Endereço & Contatos */}
          <div className={`p-4 rounded-2xl border space-y-4 ${
            isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Endereço & Contato Principal
            </span>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CEP</label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={formData.cep}
                  onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                  className={`${subInputClass} font-mono`}
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Logradouro / Endereço</label>
                <input
                  type="text"
                  value={formData.logradouro}
                  onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                  className={subInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Número</label>
                <input
                  type="text"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  className={subInputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Bairro</label>
                <input
                  type="text"
                  value={formData.bairro}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  className={subInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Cidade</label>
                <input
                  type="text"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  className={subInputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>UF</label>
                <input
                  type="text"
                  maxLength={2}
                  value={formData.uf}
                  onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                  className={`${subInputClass} font-mono uppercase`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Telefone / WhatsApp</label>
                <input
                  type="text"
                  placeholder="(00) 00000-0000"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className={`${subInputClass} font-mono`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>E-mail Comercial / Vendas</label>
              <input
                type="email"
                placeholder="vendas@fornecedor.com.br"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={subInputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Observações</label>
            <textarea
              rows={4}
              placeholder="Prazo de entrega, dia de visita do vendedor, chave PIX..."
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className={`pt-4 border-t flex items-center justify-end gap-3 ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
            >
              <Check className="w-4 h-4" /> Salvar Fornecedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
