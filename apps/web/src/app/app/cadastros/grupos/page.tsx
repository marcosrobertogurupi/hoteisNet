"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Tags, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { cadastroUI } from "../_ui";

interface Grupo {
  id: string;
  code: string | null;
  name: string;
  type: "PRODUTO" | "SERVICO" | "PRATO";
}

const EMPTY_FORM = { id: "", codigo: "", nome: "", tipo: "PRODUTO" as Grupo["type"] };

export default function GruposPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncGrupos = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/grupos");
      const data = await res.json();
      if (data?.success && Array.isArray(data.groups)) setGrupos(data.groups);
    } catch (err) {
      console.warn("[CadastroGrupos] Erro ao buscar grupos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncGrupos();
  }, [syncGrupos]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: Grupo) => {
    setForm({ id: g.id, codigo: g.code || "", nome: g.name, tipo: g.type });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Grupo",
      message: "Tem certeza que deseja excluir este grupo?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/grupos?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o grupo.");
      return;
    }
    toast.success("Grupo excluído com sucesso.");
    await syncGrupos();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Por favor, preencha o nome do grupo.");
      return;
    }

    const res = await fetch("/api/cadastros/grupos", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o grupo.");
      return;
    }
    toast.success(form.id ? "Grupo atualizado com sucesso." : "Grupo cadastrado com sucesso.");
    await syncGrupos();
    setIsModalOpen(false);
  };

  return (
    <div className={c.page(theme.bgApp, theme.textMain)}>
      <LoadingOverlay show={isLoading} message="Buscando grupos..." submessage="Estamos carregando os grupos de produtos." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-slate-500/10 text-slate-400 border-slate-500/20" : "bg-slate-100 text-slate-600 border-slate-300"
            }`}
          >
            {grupos.length} grupo(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-slate-500/10 border-slate-500/20 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-600"
              }`}
            >
              <Tags className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Grupos</h1>
              <p className={c.subtitle}>Grupos de produtos, serviços e pratos usados no PDV e Restaurante (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Grupo
          </button>
        </div>

        <div className={c.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-5 py-3.5">Código</th>
                  <th className="px-5 py-3.5">Nome do Grupo</th>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {grupos.map((g) => (
                  <tr key={g.id} className={`transition ${c.rowHover}`}>
                    <td className={`px-5 py-4 font-mono font-bold ${c.strong}`}>{g.code || "-"}</td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>{g.name}</td>
                    <td className={`px-5 py-4 font-mono ${c.muted}`}>{g.type}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(g)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-slate-300 hover:bg-sky-600 hover:text-white" : "bg-slate-100 text-slate-700 hover:bg-sky-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(g.id)}
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

                {grupos.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className={`px-5 py-12 text-center ${c.empty}`}>
                      Nenhum grupo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-6 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Grupo" : "Novo Grupo"}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Código</label>
                  <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>
                    Nome <span className="text-rose-500">*</span>
                  </label>
                  <input type="text" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={c.field} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as Grupo["type"] })}
                  className={c.field}
                >
                  <option value="PRODUTO">PRODUTO</option>
                  <option value="SERVICO">SERVIÇO</option>
                  <option value="PRATO">PRATO</option>
                </select>
              </div>
              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
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
