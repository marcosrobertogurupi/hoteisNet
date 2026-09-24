"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Wrench, Plus, Edit3, Trash2, ArrowLeft, Check, X, Eye, EyeOff } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../_ui";

// Listas cadastradas da manutenção de quartos: tipos de problema (classificação da OS, usada no
// relatório de tempo inativo) e motivos da etapa "Aguardando". Escolhidas de lista na OS, nunca
// digitadas — evita "Eletrica" / "Elétrica" / "eletrica" virarem três tipos diferentes.

type Lista = "tipos" | "motivos";

interface Item {
  id: string;
  name: string;
  active: boolean;
}

const TABS: Record<Lista, { label: string; singular: string; placeholder: string; hint: string }> = {
  tipos: {
    label: "Tipos de problema",
    singular: "tipo de problema",
    placeholder: "Ex: Hidráulica, Ar-condicionado, Elétrica",
    hint: "Classificação escolhida ao abrir cada OS de manutenção — é por ela que o relatório agrupa o tempo inativo.",
  },
  motivos: {
    label: "Motivos de espera",
    singular: "motivo de espera",
    placeholder: "Ex: Aguardando peça, Aguardando profissional externo",
    hint: "Escolhidos pelo colaborador quando a OS entra na etapa \"Aguardando\".",
  },
};

export default function ListasManutencaoPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const ui = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [tab, setTab] = useState<Lista>("tipos");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  // O valor do ToastContext muda a cada toast exibido — via ref, para `load` não mudar de
  // identidade e o efeito abaixo não recarregar a lista (e mostrar outro toast) em loop.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(async (lista: Lista) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cadastros/manutencao/${lista}`);
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) setItems(data.items);
      else toastRef.current.error(data?.error || "Não foi possível carregar a lista.");
    } catch {
      toastRef.current.error("Erro de conexão ao carregar a lista.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsFormOpen(false);
    load(tab);
  }, [tab, load]);

  const openAdd = () => {
    setEditingId(null);
    setNameInput("");
    setIsFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditingId(item.id);
    setNameInput(item.name);
    setIsFormOpen(true);
  };

  const save = async () => {
    if (!nameInput.trim()) {
      toast.warning(`Informe o nome do ${TABS[tab].singular}.`);
      return;
    }
    try {
      const res = await fetch(`/api/cadastros/manutencao/${tab}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, name: nameInput } : { name: nameInput }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível salvar.");
        return;
      }
      toast.success("Salvo com sucesso.");
      setIsFormOpen(false);
      load(tab);
    } catch {
      toast.error("Erro de conexão ao salvar.");
    }
  };

  const toggleActive = async (item: Item) => {
    try {
      const res = await fetch(`/api/cadastros/manutencao/${tab}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível alterar.");
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !item.active } : i)));
    } catch {
      toast.error("Erro de conexão ao alterar.");
    }
  };

  const remove = async (item: Item) => {
    const ok = await confirmDialog({
      title: `Excluir ${TABS[tab].singular}`,
      message: `Excluir "${item.name}"? Se ele já foi usado em alguma OS, desative em vez de excluir.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/cadastros/manutencao/${tab}?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível excluir.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Excluído com sucesso.");
    } catch {
      toast.error("Erro de conexão ao excluir.");
    }
  };

  const tabBtn = (active: boolean) =>
    `px-4 py-2 rounded-xl text-xs font-bold transition border ${
      active
        ? "bg-amber-600 border-amber-600 text-white"
        : isDark
          ? "border-slate-700 text-slate-300 hover:bg-slate-800"
          : "border-slate-300 text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className={ui.page(theme.bgApp, theme.textMain)}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/principal/cadastros" className={ui.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
        </div>

        <div className={ui.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600"
              }`}
            >
              <Wrench className="w-8 h-8" />
            </div>
            <div>
              <h1 className={ui.title}>Listas da Manutenção</h1>
              <p className={ui.subtitle}>Tipos de problema e motivos de espera usados nas ordens de serviço de manutenção dos quartos.</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo {TABS[tab].singular}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TABS) as Lista[]).map((key) => (
            <button key={key} onClick={() => setTab(key)} className={tabBtn(tab === key)}>
              {TABS[key].label}
            </button>
          ))}
        </div>
        <p className={`text-[11px] ${ui.muted}`}>{TABS[tab].hint}</p>

        {isFormOpen && (
          <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className={ui.label}>Nome</label>
                <input
                  type="text"
                  autoFocus
                  maxLength={80}
                  placeholder={TABS[tab].placeholder}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  className={ui.field}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={save}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
                >
                  <Check className="w-4 h-4" /> Salvar
                </button>
                <button onClick={() => setIsFormOpen(false)} className={`${ui.ghostBtn} flex items-center gap-2`}>
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={ui.tableCard}>
          <table className="w-full text-left text-xs">
            <thead className={ui.thead}>
              <tr>
                <th className="px-5 py-3.5">{TABS[tab].label}</th>
                <th className="px-5 py-3.5">Situação</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${ui.tdivide}`}>
              {items.map((item) => (
                <tr key={item.id} className={`transition ${ui.rowHover}`}>
                  <td className={`px-5 py-4 font-bold ${item.active ? ui.strong : ui.empty}`}>{item.name}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.active
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : isDark
                            ? "bg-slate-700 text-slate-300"
                            : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {item.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        title={item.active ? "Desativar" : "Ativar"}
                        onClick={() => toggleActive(item)}
                        className={`p-2 rounded-xl transition ${ui.iconBtn} ${isDark ? "text-slate-300" : "text-slate-600"}`}
                      >
                        {item.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        title="Editar"
                        onClick={() => openEdit(item)}
                        className={`p-2 rounded-xl transition ${ui.iconBtn} ${isDark ? "text-amber-400" : "text-amber-700"}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        title="Excluir"
                        onClick={() => remove(item)}
                        className={`p-2 rounded-xl transition ${ui.iconBtn} ${isDark ? "text-rose-400" : "text-rose-600"}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={3} className={`px-5 py-12 text-center ${ui.empty}`}>
                    Nenhum item cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
