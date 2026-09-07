"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Trash2, Plus, Loader2, Refrigerator, Search } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";

interface KitItem {
  id: string;
  productId: string;
  productName: string;
  parQuantity: number;
  unitPrice: number;
  unit: string | null;
}

interface ProductSuggestion {
  id: string;
  name: string;
  salePrice: number | string;
}

export interface KitFrigobarModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: { id: string; name: string } | null;
  onSaved?: () => void;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function KitFrigobarModal({ isOpen, onClose, category, onSaved }: KitFrigobarModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [items, setItems] = useState<KitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [newQty, setNewQty] = useState(1);
  const [pendingProduct, setPendingProduct] = useState<ProductSuggestion | null>(null);
  const [adding, setAdding] = useState(false);
  const searchSeq = useRef(0);
  const searchWrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cadastros/frigobar-kit?roomCategoryId=${encodeURIComponent(category.id)}`);
      const data = await res.json();
      if (data.success) setItems(data.items || []);
      else toast.error(data.error || "Não foi possível carregar o kit.");
    } catch {
      toast.error("Erro de rede ao carregar o kit do frigobar.");
    } finally {
      setLoading(false);
    }
  }, [category, toast]);

  useEffect(() => {
    if (!isOpen || !category) return;
    setItems([]);
    setSearch("");
    setPendingProduct(null);
    setNewQty(1);
    setDirty(false);
    load();
  }, [isOpen, category, load]);

  useEffect(() => {
    const q = search.trim();
    if (pendingProduct || q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock/lookup?code=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        setSuggestions(data.success ? (data.products || []).map((p: any) => ({ id: p.id, name: p.name, salePrice: p.salePrice })) : []);
        setShowSuggestions(true);
      } catch {
        if (seq === searchSeq.current) setSuggestions([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [search, pendingProduct]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onClick = (e: MouseEvent) => {
      if (searchWrap.current && !searchWrap.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showSuggestions]);

  const handleAdd = async () => {
    if (!category || !pendingProduct) {
      toast.warning("Escolha um produto na busca antes de adicionar.");
      return;
    }
    if (newQty < 1) {
      toast.warning("Informe a quantidade do kit (mínimo 1).");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cadastros/frigobar-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCategoryId: category.id, productId: pendingProduct.id, parQuantity: newQty }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível adicionar o produto ao kit.");
        return;
      }
      setItems((prev) => [...prev, data.item].sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR")));
      setPendingProduct(null);
      setSearch("");
      setNewQty(1);
      setDirty(true);
    } catch {
      toast.error("Erro de rede ao adicionar o produto.");
    } finally {
      setAdding(false);
    }
  };

  const handleQtyChange = async (item: KitItem, value: number) => {
    const qty = Math.max(1, Math.min(999, Math.trunc(value) || 1));
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, parQuantity: qty } : i)));
    try {
      const res = await fetch("/api/cadastros/frigobar-kit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, parQuantity: qty }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível salvar a quantidade.");
        load();
        return;
      }
      setDirty(true);
    } catch {
      toast.error("Erro de rede ao salvar a quantidade.");
      load();
    }
  };

  const handleRemove = async (item: KitItem) => {
    const ok = await confirmDialog({
      title: "Remover do kit",
      message: `Remover "${item.productName}" do kit do frigobar de ${category?.name}?`,
      confirmLabel: "Remover",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/cadastros/frigobar-kit?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível remover o item.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setDirty(true);
    } catch {
      toast.error("Erro de rede ao remover o item.");
    }
  };

  const handleClose = () => {
    if (dirty) onSaved?.();
    onClose();
  };

  if (!isOpen || !category) return null;

  const inputClass = isDark
    ? "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col my-auto ${
          isDark ? "bg-[#0F172A] border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
        }`}
      >
        <div className="bg-gradient-to-r from-[#0F766E] to-[#14B8A6] px-4 py-3 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Refrigerator className="w-5 h-5" />
            <h2 className="font-bold text-sm">Kit do frigobar — {category.name}</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Produtos e quantidades que ficam no quarto desta categoria. A governanta e a recepção conferem contra esta
            lista; a diferença vira consumo do quarto e baixa do estoque do PDV do frigobar.
          </p>

          {/* Adicionar produto */}
          <div className={`rounded-xl border p-3 space-y-3 ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div ref={searchWrap} className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={pendingProduct ? pendingProduct.name : search}
                  onChange={(e) => {
                    setPendingProduct(null);
                    setSearch(e.target.value);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Buscar produto por nome ou código"
                  className={inputClass + " pl-9"}
                />
                {showSuggestions && (
                  <div
                    className={`absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border shadow-2xl max-h-56 overflow-y-auto ${
                      isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-300"
                    }`}
                  >
                    {searching && suggestions.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400">Buscando...</div>
                    ) : suggestions.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400">Nenhum produto encontrado.</div>
                    ) : (
                      suggestions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPendingProduct(p);
                            setShowSuggestions(false);
                          }}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 flex items-center justify-between gap-2 ${
                            isDark ? "border-slate-800 hover:bg-teal-900/40" : "border-slate-100 hover:bg-teal-50"
                          }`}
                        >
                          <span className="text-[11px] font-semibold truncate">{p.name}</span>
                          <span className="text-[11px] font-mono font-bold text-emerald-500 shrink-0">
                            {fmt(parseFloat(String(p.salePrice)) || 0)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <input
                type="number"
                min={1}
                max={999}
                value={newQty}
                onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))}
                className={`${inputClass} sm:w-24 text-center`}
                title="Quantidade no kit"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !pendingProduct}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
              </button>
            </div>
          </div>

          {/* Lista do kit */}
          <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
            <table className="w-full text-left text-xs">
              <thead className={`uppercase tracking-wider ${isDark ? "bg-slate-950/80 text-slate-400" : "bg-slate-100 text-slate-600"}`}>
                <tr>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5 text-right">Preço unit.</th>
                  <th className="px-3 py-2.5 text-center w-28">Qtd. no kit</th>
                  <th className="px-3 py-2.5 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400 italic">
                      Nenhum produto no kit desta categoria ainda.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-50"}>
                      <td className="px-3 py-2.5 font-semibold">
                        {item.productName}
                        {item.unit ? <span className="text-slate-400 font-normal"> ({item.unit})</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt(item.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={item.parQuantity}
                          onChange={(e) => handleQtyChange(item, Number(e.target.value))}
                          className={`w-20 px-2 py-1 rounded-lg border text-center font-mono text-sm ${
                            isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => handleRemove(item)}
                          className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/40"
                          title="Remover do kit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`px-4 py-3 border-t flex justify-end ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
