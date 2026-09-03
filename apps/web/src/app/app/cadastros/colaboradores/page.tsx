"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { UserCheck, Plus, Edit3, Trash2, ArrowLeft, X, Check, ScanBarcode } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { cadastroUI } from "../_ui";

interface Colaborador {
  id: string;
  name: string;
  role: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  temSenha: boolean;
}

const EMPTY_FORM = {
  id: "",
  nome: "",
  cargo: "",
  cpf: "",
  telefone: "",
  email: "",
  status: "ATIVO" as "ATIVO" | "INATIVO",
  senha: "",
  removerSenha: false,
  temSenha: false,
};

export default function ColaboradoresPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const ui = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncColaboradores = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/colaboradores");
      const data = await res.json();
      if (data?.success && Array.isArray(data.employees)) setColaboradores(data.employees);
    } catch (err) {
      console.warn("[CadastroColaboradores] Erro ao buscar colaboradores:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncColaboradores();
  }, [syncColaboradores]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (col: Colaborador) => {
    setForm({
      id: col.id,
      nome: col.name,
      cargo: col.role || "",
      cpf: col.cpf || "",
      telefone: col.phone || "",
      email: col.email || "",
      status: col.active ? "ATIVO" : "INATIVO",
      senha: "",
      removerSenha: false,
      temSenha: col.temSenha,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Colaborador",
      message: "Tem certeza que deseja excluir este colaborador?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/colaboradores?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o colaborador.");
      return;
    }
    toast.success("Colaborador excluído com sucesso.");
    await syncColaboradores();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Por favor, preencha o nome do colaborador.");
      return;
    }

    const res = await fetch("/api/cadastros/colaboradores", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o colaborador.");
      return;
    }
    toast.success(form.id ? "Colaborador atualizado com sucesso." : "Colaborador cadastrado com sucesso.");
    await syncColaboradores();
    setIsModalOpen(false);
  };

  const field = `w-full px-3.5 py-2 rounded-xl text-sm focus:outline-none ${
    isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-purple-500" : "bg-white border border-slate-300 text-slate-900 focus:border-purple-500"
  }`;

  return (
    <div className={ui.page(theme.bgApp, theme.textMain)}>
      <LoadingOverlay show={isLoading} message="Buscando colaboradores..." submessage="Estamos carregando o quadro de colaboradores." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={ui.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-purple-50 text-purple-700 border-purple-200"
            }`}
          >
            {colaboradores.length} colaborador(es)
          </span>
        </div>

        <div className={ui.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-purple-500/10 border-purple-500/20 text-purple-400" : "bg-purple-50 border-purple-200 text-purple-600"
              }`}
            >
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className={ui.title}>Cadastro de Colaboradores</h1>
              <p className={ui.subtitle}>Funcionários da recepção, cozinha, governança e administração (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Colaborador
          </button>
        </div>

        <div className={ui.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={ui.thead}>
                <tr>
                  <th className="px-5 py-3.5">Nome / CPF</th>
                  <th className="px-5 py-3.5">Cargo / Função</th>
                  <th className="px-5 py-3.5">Telefone / E-mail</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${ui.tdivide}`}>
                {colaboradores.map((col) => (
                  <tr key={col.id} className={`transition ${ui.rowHover}`}>
                    <td className="px-5 py-4">
                      <span className={`font-bold text-sm block ${ui.strong}`}>{col.name}</span>
                      <span className="font-mono text-[10px] text-purple-600 dark:text-purple-400">CPF: {col.cpf || "-"}</span>
                    </td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>{col.role || "-"}</td>
                    <td className={`px-5 py-4 font-mono ${ui.muted}`}>
                      <div>{col.phone || "-"}</div>
                      <div className={`text-[10px] ${ui.empty}`}>{col.email || "-"}</div>
                      {col.temSenha && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                          <ScanBarcode className="w-2.5 h-2.5" /> app de contagem
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          col.active
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : isDark
                              ? "bg-slate-700 text-slate-300"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {col.active ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(col)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-purple-400 hover:bg-purple-600 hover:text-white" : "bg-slate-100 text-purple-700 hover:bg-purple-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(col.id)}
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

                {colaboradores.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className={`px-5 py-12 text-center ${ui.empty}`}>
                      Nenhum colaborador cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className={ui.modalBackdrop}>
          <div className={`${ui.modalCard} max-w-lg`}>
            <div className={`p-6 border-b flex items-center justify-between ${ui.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Colaborador" : "Novo Colaborador"}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={ui.label}>
                  Nome <span className="text-rose-500">*</span>
                </label>
                <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={field} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={ui.label}>Cargo / Função</label>
                  <input type="text" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className={field} />
                </div>
                <div className="space-y-1.5">
                  <label className={ui.label}>CPF</label>
                  <input type="text" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={ui.label}>Telefone</label>
                  <input type="text" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={field} />
                </div>
                <div className="space-y-1.5">
                  <label className={ui.label}>E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={ui.label}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "ATIVO" | "INATIVO" })}
                  className={field}
                >
                  <option value="ATIVO">ATIVO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>

              {/* Acesso ao app mobile de contagem de estoque — login por telefone + senha */}
              <div
                className={`space-y-3 rounded-xl border p-4 ${
                  isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <ScanBarcode className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                  <span className={`text-xs font-bold ${ui.strong}`}>Acesso ao app de contagem de estoque</span>
                </div>
                <p className={`text-[11px] ${ui.muted}`}>
                  O colaborador entra no app pelo <strong>telefone</strong> acima e pela senha definida aqui. Deixe a
                  senha em branco para não alterar.
                  {form.temSenha ? " Este colaborador já tem acesso." : " Este colaborador ainda não tem acesso."}
                </p>
                <div className="space-y-1.5">
                  <label className={ui.label}>{form.temSenha ? "Nova senha" : "Senha"}</label>
                  <input
                    type="text"
                    autoComplete="new-password"
                    value={form.senha}
                    disabled={form.removerSenha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                    placeholder={form.temSenha ? "•••• (deixe em branco para manter)" : "mínimo 4 caracteres"}
                    className={`${field} ${form.removerSenha ? "opacity-50" : ""}`}
                  />
                </div>
                {form.temSenha && (
                  <label className="flex items-center gap-2 text-[11px] font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.removerSenha}
                      onChange={(e) => setForm({ ...form, removerSenha: e.target.checked, senha: "" })}
                    />
                    Remover o acesso deste colaborador ao app de contagem
                  </label>
                )}
              </div>

              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${ui.modalDivider}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={ui.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
                >
                  <Check className="w-4 h-4" /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
