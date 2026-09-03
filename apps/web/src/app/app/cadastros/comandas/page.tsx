"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Receipt, Plus, Edit3, Trash2, ArrowLeft, X, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cadastroUI } from "../_ui";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface MesaComanda {
  id: string;
  number: string;
  description: string | null;
  type: "MESA" | "COMANDA_AVULSA";
  status: "LIVRE" | "ABERTA";
  active: boolean;
}

const EMPTY_FORM = { id: "", numero: "", descricao: "", tipo: "MESA" as MesaComanda["type"], status: "LIVRE" };

export default function ComandasPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [mesas, setMesas] = useState<MesaComanda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const syncMesas = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/comandas");
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) setMesas(data.items);
    } catch (err) {
      console.warn("[CadastroComandas] Erro ao buscar mesas/comandas:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    syncMesas();
  }, [syncMesas]);

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: MesaComanda) => {
    setForm({
      id: m.id,
      numero: m.number,
      descricao: m.description || "",
      tipo: m.type,
      status: m.type === "COMANDA_AVULSA" ? (m.active ? "ATIVA" : "INATIVA") : m.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Excluir Mesa/Comanda",
      message: "Tem certeza que deseja excluir este registro?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/cadastros/comandas?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível excluir.");
      return;
    }
    toast.success("Excluído com sucesso.");
    await syncMesas();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim()) {
      toast.warning("Por favor, preencha o número.");
      return;
    }

    const res = await fetch("/api/cadastros/comandas", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar.");
      return;
    }
    toast.success(form.id ? "Atualizado com sucesso." : "Cadastrado com sucesso.");
    await syncMesas();
    setIsModalOpen(false);
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando mesas e comandas..." submessage="Estamos carregando o cadastro de mesas." />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-pink-500/10 text-pink-400 border border-pink-500/20 px-3 py-1 rounded-full font-bold">
            {mesas.length} registro(s)
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded-2xl">
              <Receipt className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Mesas & Comandas</h1>
              <p className={c.subtitle}>Restaurante, bar da piscina e comandas avulsas (SaaS Multi-tenant).</p>
            </div>
          </div>
          <button onClick={handleOpenAdd} className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-600/20 transition">
            <Plus className="w-4 h-4" /> Nova Mesa / Comanda
          </button>
        </div>

        <div className={c.tableCard}>
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-5 py-3.5">Número / Identificador</th>
                <th className="px-5 py-3.5">Descrição / Localização</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {mesas.map((m) => (
                <tr key={m.id} className={`transition ${c.rowHover}`}>
                  <td className={`px-5 py-4 font-mono font-bold  text-base ${c.strong}`}>
                    Nº {m.number}
                  </td>
                  <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>{m.description || "-"}</td>
                  <td className={`px-5 py-4 font-mono ${c.muted}`}>{m.type === "COMANDA_AVULSA" ? "COMANDA" : "MESA"}</td>
                  <td className="px-5 py-4">
                    {m.type === "COMANDA_AVULSA" ? (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        m.active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"
                      }`}>
                        {m.active ? "ATIVA" : "INATIVA"}
                      </span>
                    ) : (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === "LIVRE" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {m.status}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenEdit(m)} className={`p-2 rounded-xl transition ${isDark ? "bg-slate-800 text-pink-400 hover:bg-pink-600 hover:text-white" : "bg-slate-100 text-pink-700 hover:bg-pink-600 hover:text-white"}`}><Edit3 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(m.id)} className={`p-2 rounded-xl transition ${isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-700 hover:bg-rose-600 hover:text-white"}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}

              {mesas.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className={`px-5 py-12 text-center ${c.empty}`}>Nenhuma mesa/comanda cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-lg`}>
            <div className={`p-6 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">{form.id ? "Editar Mesa/Comanda" : "Nova Mesa / Comanda"}</h2>
              <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-xl transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Número <span className="text-rose-500">*</span></label>
                  <input type="text" required value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={c.field} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className={c.label}>Descrição / Localização</label>
                  <input type="text" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className={c.field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={c.label}>Tipo</label>
                  <select
                    value={form.tipo}
                    disabled={!!form.id}
                    onChange={(e) => {
                      const tipo = e.target.value as MesaComanda["type"];
                      setForm({ ...form, tipo, status: tipo === "COMANDA_AVULSA" ? "ATIVA" : "LIVRE" });
                    }}
                    className={c.field}
                  >
                    <option value="MESA">MESA</option>
                    <option value="COMANDA_AVULSA">COMANDA</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={c.label}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={c.field}>
                    {form.tipo === "COMANDA_AVULSA" ? (
                      <>
                        <option value="ATIVA">ATIVA</option>
                        <option value="INATIVA">INATIVA</option>
                      </>
                    ) : (
                      <>
                        <option value="LIVRE">LIVRE</option>
                        <option value="ABERTA">ABERTA</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              {form.tipo === "COMANDA_AVULSA" && !form.id && (
                <p className={`text-[11px] ${c.subtitle}`}>
                  Dica: digite um intervalo como <span className="font-mono font-bold">1-50</span> para criar várias comandas de uma vez.
                </p>
              )}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className={c.ghostBtn}>Cancelar</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-pink-600/20 transition"><Check className="w-4 h-4" /> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
