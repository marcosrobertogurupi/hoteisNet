"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, Search, Edit3, Trash2, ArrowLeft, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cadastroUI } from "../_ui";

interface HotelService {
  id: string;
  code: string | null;
  description: string;
  category: string | null;
  price: number;
  active: boolean;
}

export default function ServicosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);

  const [services, setServices] = useState<HotelService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("0");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setIsLoading(true);
    fetch("/api/tenant/services")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setServices(data.services);
        else setError(data.error || "Erro ao carregar serviços.");
      })
      .catch(() => setError("Erro de rede ao carregar serviços."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = services.filter(
    (s) =>
      s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.code || "").includes(searchQuery)
  );

  const openNew = () => {
    setEditingId(null);
    setCode("");
    setDescription("");
    setCategory("");
    setPrice("0");
    setShowModal(true);
  };

  const openEdit = (s: HotelService) => {
    setEditingId(s.id);
    setCode(s.code || "");
    setDescription(s.description);
    setCategory(s.category || "");
    setPrice(String(s.price));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      const payload = { code, description, category, price: Number(price) || 0 };
      const res = await fetch(editingId ? `/api/tenant/services/${editingId}` : "/api/tenant/services", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        load();
      } else {
        setError(data.error || "Erro ao salvar serviço.");
      }
    } catch {
      setError("Erro de rede ao salvar serviço.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/tenant/services/${id}`, { method: "DELETE" });
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className={c.page(theme.bgApp, theme.textMain)}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={c.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-cyan-50 text-cyan-700 border-cyan-200"
            }`}
          >
            Dados Sincronizados
          </span>
        </div>

        <div className={c.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400" : "bg-cyan-50 border-cyan-200 text-cyan-600"
              }`}
            >
              <Briefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className={c.title}>Cadastro de Serviços Prestados</h1>
              <p className={c.subtitle}>
                Lavanderia, traslado, passeios e taxas adicionais. Também consultado pelo Agente de Atendimento.
              </p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{error}</div>}

        <div className={c.toolbar}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar serviço por descrição ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${c.input} pl-10 pr-4 py-2`}
            />
          </div>
          <span className={`text-xs font-mono ${c.muted}`}>
            Total: <strong className={c.strong}>{services.length}</strong>
          </span>
        </div>

        <div className={c.tableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-5 py-3.5">Cód / Serviço</th>
                  <th className="px-5 py-3.5">Categoria / Tipo</th>
                  <th className="px-5 py-3.5">Valor Unitário</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className={`px-5 py-6 text-center ${c.empty}`}>
                      Carregando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={`px-5 py-6 text-center ${c.empty}`}>
                      Nenhum serviço cadastrado ainda.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr key={s.id} className={`transition ${c.rowHover}`}>
                      <td className="px-5 py-4">
                        <span className={`font-bold text-sm block ${c.strong}`}>{s.description}</span>
                        {s.code && <span className={`font-mono text-[10px] ${c.muted}`}>Cód: {s.code}</span>}
                      </td>
                      <td className={`px-5 py-4 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {s.category || "—"}
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        R$ {Number(s.price).toFixed(2)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(s)}
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-cyan-400 hover:bg-cyan-600 hover:text-white" : "bg-slate-100 text-cyan-700 hover:bg-cyan-600 hover:text-white"
                            }`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-md`}>
            <div className={`p-6 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-cyan-500" /> {editingId ? "Editar Serviço" : "Novo Serviço"}
              </h3>
              <button onClick={() => setShowModal(false)} className={c.muted}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div className="space-y-1">
                <label className={c.label}>Descrição</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className={c.field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={c.label}>Código</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} className={c.field} />
                </div>
                <div className="space-y-1">
                  <label className={c.label}>Categoria</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Transporte, Lavanderia..."
                    className={c.field}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className={c.label}>Valor (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`${c.field} font-mono`}
                />
              </div>
            </div>
            <div className={`px-6 pb-6 flex justify-end gap-3 pt-3 border-t ${c.modalDivider}`}>
              <button onClick={() => setShowModal(false)} className={c.ghostBtn}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg font-bold hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
