"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Layers, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";
import { cadastroUI } from "../_ui";

interface Tipo {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  emUso: number;
}

const EMPTY_FORM = { id: "", codigo: "", nome: "", active: true };

export default function TiposProdutoPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/tipos-produto");
      const data = await res.json();
      if (data?.success && Array.isArray(data.types)) setTipos(data.types);
    } catch (err) {
      console.warn("[CadastroTiposProduto] Erro ao buscar tipos:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Tipo) => {
    setForm({ id: t.id, codigo: t.code || "", nome: t.name, active: t.active });
    setIsModalOpen(true);
  };

  const handleDelete = async (t: Tipo) => {
    const ok = await confirmDialog({
      title: "Excluir Tipo de Produto",
      message: `Excluir o tipo "${t.name}"?`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/tipos-produto?id=${t.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir o tipo.");
      return;
    }
    toast.success("Tipo excluído com sucesso.");
    await sync();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warning("Preencha o nome do tipo.");
      return;
    }

    const res = await fetch("/api/cadastros/tipos-produto", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o tipo.");
      return;
    }
    toast.success(form.id ? "Tipo atualizado com sucesso." : "Tipo cadastrado com sucesso.");
    await sync();
    setIsModalOpen(false);
  };

  return (
    <div className={c.page(theme.bgApp, theme.textMain)}>
      <LoadingOverlay show={isLoading} message="Buscando tipos de produto..." submessage="Carregando a lista cadastrada." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-violet-500/10 text-violet-300 border-violet-500/20" : "bg-violet-50 text-violet-700 border-violet-200"
            }`}
          >
            {tipos.length} tipo(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-violet-500/10 border-violet-500/20 text-violet-300" : "bg-violet-50 border-violet-200 text-violet-600"
              }`}
            >
              <Layers className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Tipos de Produto</h1>
              <p className={c.subtitle}>
                Segunda classificação do produto, independente do grupo (ex.: Revenda, Uso e consumo, Cortesia). Espelha o TipoProduto do sistema legado.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Tipo
          </button>
        </div>

        <div className={c.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-5 py-3.5">Código</th>
                  <th className="px-5 py-3.5">Nome</th>
                  <th className="px-5 py-3.5 text-center">Situação</th>
                  <th className="px-5 py-3.5 text-center">Produtos</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {tipos.map((t) => (
                  <tr key={t.id} className={`transition ${c.rowHover}`}>
                    <td className={`px-5 py-4 font-mono font-bold ${c.strong}`}>{t.code || "-"}</td>
                    <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>{t.name}</td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.active
                            ? isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                            : isDark ? "bg-slate-600/20 text-slate-400" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {t.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className={`px-5 py-4 text-center font-mono ${c.muted}`}>{t.emUso}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-violet-300 hover:bg-violet-600 hover:text-white" : "bg-slate-100 text-violet-700 hover:bg-violet-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
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

                {tipos.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className={`px-5 py-12 text-center ${c.empty}`}>
                      Nenhum tipo cadastrado.
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
              <h2 className="text-lg font-bold">{form.id ? "Editar Tipo" : "Novo Tipo"}</h2>
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
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Ativo (aparece para seleção no cadastro de produtos)
              </label>
              <div className={`pt-2 flex items-center justify-end gap-3 border-t ${c.modalDivider}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/20 transition"
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
