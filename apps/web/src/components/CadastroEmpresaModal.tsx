"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Plus, 
  Trash2, 
  Check, 
  Copy
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { TelefoneItem, EmailItem } from "@/components/CadastroHospedeModal";

export interface EmpresaFormData {
  id?: string;
  cnpj: string;
  razao: string;
  fantasia: string;
  ie: string;
  cep: string;
  logradouro: string;
  numero: string;
  complEnder: string;
  bairro: string;
  cidade: string;
  uf: string;
  cepCobr: string;
  logradouroCobr: string;
  numeroCobr: string;
  complEnderCobr: string;
  bairroCobr: string;
  cidadeCobr: string;
  ufCobr: string;

  telefones: TelefoneItem[];
  emails: EmailItem[];
  observacao: string;
}

interface CadastroEmpresaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EmpresaFormData) => void;
  initialData?: EmpresaFormData | null;
}

export default function CadastroEmpresaModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CadastroEmpresaModalProps) {
  const { theme } = useTheme();
  const toast = useToast();
  const isDark = theme.isDark;

  const [activeTab, setActiveTab] = useState<"dados" | "cobranca" | "contatos" | "obs">("dados");

  const [formData, setFormData] = useState<EmpresaFormData>({
    cnpj: "",
    razao: "",
    fantasia: "",
    ie: "",
    cep: "",
    logradouro: "",
    numero: "",
    complEnder: "",
    bairro: "",
    cidade: "",
    uf: "",
    cepCobr: "",
    logradouroCobr: "",
    numeroCobr: "",
    complEnderCobr: "",
    bairroCobr: "",
    cidadeCobr: "",
    ufCobr: "",
    telefones: [],
    emails: [],
    observacao: "",
  });

  const [tempPhone, setTempPhone] = useState("");
  const [tempPhoneDesc, setTempPhoneDesc] = useState("Comercial");
  const [tempPhoneMain, setTempPhoneMain] = useState(false);

  const [tempEmail, setTempEmail] = useState("");
  const [tempEmailMain, setTempEmailMain] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        cnpj: "",
        razao: "",
        fantasia: "",
        ie: "",
        cep: "",
        logradouro: "",
        numero: "",
        complEnder: "",
        bairro: "",
        cidade: "",
        uf: "",
        cepCobr: "",
        logradouroCobr: "",
        numeroCobr: "",
        complEnderCobr: "",
        bairroCobr: "",
        cidadeCobr: "",
        ufCobr: "",
        telefones: [],
        emails: [],
        observacao: "",
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleCnpjChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 14);
    let formatted = clean;
    if (clean.length > 12) {
      formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
    } else if (clean.length > 8) {
      formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    } else if (clean.length > 5) {
      formatted = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    } else if (clean.length > 2) {
      formatted = `${clean.slice(0, 2)}.${clean.slice(2)}`;
    }
    setFormData((prev) => ({ ...prev, cnpj: formatted }));
  };

  const handleReplicateAddress = () => {
    setFormData((prev) => ({
      ...prev,
      cepCobr: prev.cep,
      logradouroCobr: prev.logradouro,
      numeroCobr: prev.numero,
      complEnderCobr: prev.complEnder,
      bairroCobr: prev.bairro,
      cidadeCobr: prev.cidade,
      ufCobr: prev.uf,
    }));
  };

  const handleAddPhone = () => {
    if (!tempPhone.trim()) return;
    const newItem: TelefoneItem = {
      telefone: tempPhone.trim(),
      descricao: tempPhoneDesc,
      telPrincipal: tempPhoneMain || formData.telefones.length === 0,
    };
    setFormData((prev) => ({
      ...prev,
      telefones: [...prev.telefones, newItem],
    }));
    setTempPhone("");
    setTempPhoneDesc("Comercial");
    setTempPhoneMain(false);
  };

  const handleAddEmail = () => {
    if (!tempEmail.trim()) return;
    const newItem: EmailItem = {
      email: tempEmail.trim(),
      emailPrincipal: tempEmailMain || formData.emails.length === 0,
    };
    setFormData((prev) => ({
      ...prev,
      emails: [...prev.emails, newItem],
    }));
    setTempEmail("");
    setTempEmailMain(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.razao.trim()) {
      toast.warning("Por favor, preencha a Razão Social da Empresa.");
      return;
    }
    onSave(formData);
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-blue-600 shadow-sm";

  const subInputClass = isDark
    ? "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        {/* Header Modal */}
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600"
            }`}>
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {initialData ? "Editar Empresa Conveniada" : "Nova Empresa Conveniada"}
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                WinDev Form: Win_VisAltCadEmpresa / Win_IncEmpresa
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

        {/* Tab Navigation */}
        <div className={`flex items-center gap-2 px-6 pt-4 border-b overflow-x-auto ${
          isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-slate-100/60"
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab("dados")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "dados"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" /> Dados Comerciais & Sede
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cobranca")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "cobranca"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <MapPin className="w-4 h-4" /> Endereço de Cobrança / Faturamento
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("contatos")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "contatos"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Phone className="w-4 h-4" /> Contatos ({formData.telefones.length + formData.emails.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("obs")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
              activeTab === "obs"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" /> Observações & Convênio
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "dados" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CNPJ</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={formData.cnpj}
                    onChange={(e) => handleCnpjChange(e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Razão Social <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Petrobras Distribuidora S.A."
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
                    placeholder="Ex: BR Petrobras"
                    value={formData.fantasia}
                    onChange={(e) => setFormData({ ...formData, fantasia: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Inscrição Estadual (IE)</label>
                  <input
                    type="text"
                    placeholder="Isento ou Nº da IE"
                    value={formData.ie}
                    onChange={(e) => setFormData({ ...formData, ie: e.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              {/* Endereço Sede */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                  Endereço da Sede Comercial
                </span>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CEP</label>
                    <input
                      type="text"
                      placeholder="70000-000"
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      className={`${subInputClass} font-mono`}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Logradouro / Rua</label>
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
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Complemento</label>
                    <input
                      type="text"
                      placeholder="Bloco C Sala 400"
                      value={formData.complEnder}
                      onChange={(e) => setFormData({ ...formData, complEnder: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

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
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>UF / Estado</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={formData.uf}
                      onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                      className={`${subInputClass} font-mono uppercase`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ENDEREÇO DE COBRANÇA */}
          {activeTab === "cobranca" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    Endereço de Cobrança / Faturamento
                  </span>

                  <button
                    type="button"
                    onClick={handleReplicateAddress}
                    className={`px-3 py-1.5 border rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                      isDark 
                        ? "bg-blue-600/20 text-blue-400 border-blue-500/30 hover:bg-blue-600/30" 
                        : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                    }`}
                  >
                    <Copy className="w-3.5 h-3.5" /> Replicar Endereço Comercial (WinDev Btn_RepEnd)
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>CEP Cobrança</label>
                    <input
                      type="text"
                      value={formData.cepCobr}
                      onChange={(e) => setFormData({ ...formData, cepCobr: e.target.value })}
                      className={`${subInputClass} font-mono`}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Logradouro Cobrança</label>
                    <input
                      type="text"
                      value={formData.logradouroCobr}
                      onChange={(e) => setFormData({ ...formData, logradouroCobr: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Número</label>
                    <input
                      type="text"
                      value={formData.numeroCobr}
                      onChange={(e) => setFormData({ ...formData, numeroCobr: e.target.value })}
                      className={subInputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Complemento</label>
                    <input
                      type="text"
                      value={formData.complEnderCobr}
                      onChange={(e) => setFormData({ ...formData, complEnderCobr: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Bairro</label>
                    <input
                      type="text"
                      value={formData.bairroCobr}
                      onChange={(e) => setFormData({ ...formData, bairroCobr: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Cidade</label>
                    <input
                      type="text"
                      value={formData.cidadeCobr}
                      onChange={(e) => setFormData({ ...formData, cidadeCobr: e.target.value })}
                      className={subInputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>UF</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={formData.ufCobr}
                      onChange={(e) => setFormData({ ...formData, ufCobr: e.target.value.toUpperCase() })}
                      className={`${subInputClass} font-mono uppercase`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONTATOS */}
          {activeTab === "contatos" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                  <Phone className="w-4 h-4 text-blue-500" /> Telefones Comerciais / Financeiro
                </h3>

                <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="md:col-span-6 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Telefone / Ramal</label>
                    <input
                      type="text"
                      placeholder="(11) 3000-0000"
                      value={tempPhone}
                      onChange={(e) => setTempPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>Descrição</label>
                    <input
                      type="text"
                      placeholder="Ex: Depto Financeiro"
                      value={tempPhoneDesc}
                      onChange={(e) => setTempPhoneDesc(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddPhone}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {formData.telefones.map((t, idx) => (
                        <tr key={idx} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                          <td className="px-4 py-2 font-mono font-medium">{t.telefone}</td>
                          <td className="px-4 py-2">{t.descricao}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, telefones: prev.telefones.filter((_, i) => i !== idx) }))}
                              className="text-rose-500 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {formData.telefones.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                            Nenhum telefone comercial adicionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Emails */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                  <Mail className="w-4 h-4 text-blue-500" /> E-mails de Faturamento & Reservas
                </h3>

                <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="md:col-span-10 space-y-1">
                    <label className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"}`}>E-mail Corporativo</label>
                    <input
                      type="email"
                      placeholder="financeiro@empresa.com.br"
                      value={tempEmail}
                      onChange={(e) => setTempEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddEmail}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Adicionar
                    </button>
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-left text-xs">
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {formData.emails.map((e, idx) => (
                        <tr key={idx} className={isDark ? "hover:bg-slate-800/50 text-white" : "hover:bg-slate-50 text-slate-900"}>
                          <td className="px-4 py-2 font-medium">{e.email}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, emails: prev.emails.filter((_, i) => i !== idx) }))}
                              className="text-rose-500 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {formData.emails.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                            Nenhum e-mail comercial adicionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: OBSERVAÇÕES */}
          {activeTab === "obs" && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}>
                <h3 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                  <FileText className="w-4 h-4 text-blue-500" /> Condições do Convênio Corporativo
                </h3>

                <textarea
                  rows={6}
                  placeholder="Detalhes das tarifas especiais, faturamento quinzenal/mensal, responsável pelo contrato..."
                  value={formData.observacao}
                  onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  className={`${inputClass} leading-relaxed`}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
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
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition"
            >
              <Check className="w-4 h-4" /> Salvar Empresa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
