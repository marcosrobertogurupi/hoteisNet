"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, Search, Edit3, Trash2, ArrowLeft, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

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
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgCard} text-slate-100 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
          <span className="text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full font-bold">
            Dados Sincronizados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
              <Briefcase className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cadastro de Serviços Prestados</h1>
              <p className="text-xs text-slate-400">Lavanderia, traslado, passeios e taxas adicionais. Também consultado pelo Agente de Atendimento.</p>
            </div>
          </div>
          <button onClick={openNew} className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition">
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>

        {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>}

        <div className="flex items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar serviço por descrição ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <span className="text-xs font-mono text-slate-400">Total: <strong className="text-white">{services.length}</strong></span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Cód / Serviço</th>
                <th className="px-5 py-3.5">Categoria / Tipo</th>
                <th className="px-5 py-3.5">Valor Unitário</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">Nenhum serviço cadastrado ainda.</td></tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-4">
                      <span className="font-bold text-white text-sm block">{s.description}</span>
                      {s.code && <span className="font-mono text-[10px] text-slate-400">Cód: {s.code}</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-300 font-medium">{s.category || "—"}</td>
                    <td className="px-5 py-4 font-mono font-bold text-cyan-400">R$ {Number(s.price).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(s)} className="p-2 rounded-xl bg-slate-800 text-cyan-400 hover:bg-cyan-600 hover:text-white transition"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(s.id)} className="p-2 rounded-xl bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-cyan-400" /> {editingId ? "Editar Serviço" : "Novo Serviço"}
              </h3>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Descrição</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Código</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Categoria</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Transporte, Lavanderia..." className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Valor (R$)</label>
                <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-cyan-500 text-slate-950 text-sm rounded-lg font-bold hover:bg-cyan-600 disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
