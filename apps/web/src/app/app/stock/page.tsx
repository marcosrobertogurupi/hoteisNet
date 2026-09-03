"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { Package, ArrowRightLeft, Plus, ScanBarcode, Trash2, X, Loader2, Store, Check, ClipboardCheck } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import { usePolling } from "@/lib/usePolling";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../cadastros/_ui";

interface ProductBarcode {
  id: string;
  code: string;
}

interface PosLocation {
  id: string;
  name: string;
  isCentral: boolean;
  active: boolean;
}

interface StockProduct {
  id: string;
  name: string;
  category: string;
  generalStock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  posStocks: Record<string, number>;
}

export default function TenantStockPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const toast = useToast();

  const [products, setProducts] = useState<StockProduct[]>([]);
  const [posLocations, setPosLocations] = useState<PosLocation[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");

  // Transferência Estoque Geral -> PDV
  const [transferProduct, setTransferProduct] = useState<StockProduct | null>(null);
  const [transferQty, setTransferQty] = useState(10);
  const [targetPos, setTargetPos] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);

  // Códigos de barras
  const [barcodeProduct, setBarcodeProduct] = useState<StockProduct | null>(null);
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [barcodesLoading, setBarcodesLoading] = useState(false);
  const [newBarcodeInput, setNewBarcodeInput] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const activePos = useMemo(() => posLocations.filter((p) => p.active), [posLocations]);

  const anyModalOpen = !!transferProduct || !!barcodeProduct;

  // Lista de PDVs (colunas) — cadastro único em /app/cadastros/pdv. Carrega uma vez, fora do polling.
  const loadPosLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/cadastros/pdv");
      const data = await res.json();
      if (data?.success && Array.isArray(data.posLocations)) setPosLocations(data.posLocations);
    } catch {
      /* silencioso */
    }
  }, []);

  const syncStock = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const data = await res.json();
      if (data?.success && Array.isArray(data.products)) setProducts(data.products);
    } catch (err) {
      console.warn("[ControleEstoque] Erro na sincronização:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadPosLocations();
  }, [loadPosLocations]);

  // 30 s de frescor é de sobra: as baixas por consumo são pontuais. Pausa com modal aberto
  // e com a aba em segundo plano (usePolling).
  usePolling(syncStock, 30000, { paused: anyModalOpen });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  // ---- Transferência ----
  const openTransfer = (p: StockProduct) => {
    setTransferProduct(p);
    setTransferQty(Math.min(10, p.generalStock) || 1);
    setTargetPos(activePos[0]?.id ?? "");
  };

  const handleExecuteTransfer = async () => {
    if (!transferProduct || !targetPos || transferQty <= 0) return;
    setTransferSaving(true);
    try {
      const res = await fetch("/api/stock/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: transferProduct.id, posLocationId: targetPos, quantity: transferQty }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível transferir o estoque.");
        return;
      }
      const posName = activePos.find((p) => p.id === targetPos)?.name ?? "PDV";
      toast.success(`${transferQty} un. de "${transferProduct.name}" transferidas para ${posName}.`);
      setTransferProduct(null);
      await syncStock();
    } catch {
      toast.error("Erro de rede ao transferir o estoque.");
    } finally {
      setTransferSaving(false);
    }
  };

  // ---- Códigos de barras ----
  const openBarcodeModal = async (product: StockProduct) => {
    setBarcodeProduct(product);
    setNewBarcodeInput("");
    setBarcodeError(null);
    setBarcodesLoading(true);
    try {
      const res = await fetch(`/api/stock/barcodes?productId=${product.id}`);
      const data = await res.json();
      setBarcodes(data.success ? data.barcodes : []);
    } catch {
      setBarcodes([]);
    } finally {
      setBarcodesLoading(false);
    }
  };

  const handleAddBarcode = async () => {
    const code = newBarcodeInput.trim();
    if (!code || !barcodeProduct) return;
    setBarcodeSaving(true);
    setBarcodeError(null);
    try {
      const res = await fetch("/api/stock/barcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: barcodeProduct.id, code }),
      });
      const data = await res.json();
      if (!data.success) {
        setBarcodeError(data.error || "Não foi possível vincular este código de barras.");
        return;
      }
      setBarcodes((prev) => [...prev, data.barcode]);
      setNewBarcodeInput("");
    } catch {
      setBarcodeError("Erro de rede ao vincular código de barras.");
    } finally {
      setBarcodeSaving(false);
    }
  };

  const handleRemoveBarcode = async (barcodeId: string) => {
    setBarcodes((prev) => prev.filter((b) => b.id !== barcodeId));
    try {
      await fetch("/api/stock/barcodes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: barcodeId }),
      });
    } catch {
      /* mantém removido na tela; reabrir o modal resincroniza */
    }
  };

  const totalGeneral = useMemo(() => products.reduce((s, p) => s + p.generalStock, 0), [products]);
  const posTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const loc of posLocations) map[loc.id] = 0;
    for (const p of products) {
      for (const [locId, qty] of Object.entries(p.posStocks)) {
        map[locId] = (map[locId] ?? 0) + qty;
      }
    }
    return map;
  }, [products, posLocations]);

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoadingProducts} message="Buscando estoque..." submessage="Carregando os saldos mais recentes por PDV." />

      {/* Cabeçalho */}
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 text-sky-500 rounded-2xl">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h1 className={c.title}>Controle de Estoque Multi-PDV</h1>
            <p className={c.subtitle}>Estoque geral (almoxarifado) e saldo fracionado por ponto de venda.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/stock/contagens"
            className="px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
          >
            <ClipboardCheck className="w-4 h-4" /> Conferências de contagem
          </Link>
          <Link
            href="/app/cadastros/pdv"
            className={`px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition ${c.iconBtn} ${c.strong}`}
          >
            <Store className="w-4 h-4" /> Cadastro de PDVs
          </Link>
        </div>
      </div>

      {/* Cards de saldo por local */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-2xl border space-y-1 ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
          <span className={`text-xs font-medium block ${c.muted}`}>Estoque Geral (Almoxarifado)</span>
          <span className="text-xl font-bold font-mono text-sky-500 block">{totalGeneral} un.</span>
        </div>
        {activePos.map((loc) => (
          <div key={loc.id} className={`p-4 rounded-2xl border space-y-1 ${isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
            <span className={`text-xs font-medium block ${c.muted}`}>{loc.name}{loc.isCentral ? " (Central)" : ""}</span>
            <span className="text-xl font-bold font-mono text-amber-500 block">{posTotals[loc.id] ?? 0} un.</span>
          </div>
        ))}
      </div>

      {/* Quadro */}
      <div className={c.tableCard}>
        <div className={`p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${c.modalDivider}`}>
          <h3 className={`text-sm font-semibold ${c.strong}`}>Estoque geral e fracionado por PDV</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto ou grupo..."
            className={`md:w-72 px-3 py-1.5 ${c.input}`}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-4 py-3">Produto / Grupo</th>
                <th className="px-4 py-3">Estoque Geral</th>
                {activePos.map((loc) => (
                  <th key={loc.id} className="px-4 py-3 whitespace-nowrap">{loc.name}</th>
                ))}
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${c.tdivide}`}>
              {filtered.map((p) => (
                <tr key={p.id} className={`transition ${c.rowHover}`}>
                  <td className="px-4 py-3">
                    <div className={`font-semibold ${c.strong}`}>{p.name}</div>
                    <span className={`text-[10px] font-mono ${c.empty}`}>{p.category} • Venda: R$ {p.salePrice.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className={`font-bold text-sm ${p.generalStock <= p.minStock ? "text-rose-500" : "text-sky-500"}`}>{p.generalStock} un.</span>
                    <span className={`text-[10px] block ${c.empty}`}>Mín: {p.minStock} un.</span>
                  </td>
                  {activePos.map((loc) => (
                    <td key={loc.id} className="px-4 py-3 font-mono font-semibold text-amber-500">{p.posStocks[loc.id] ?? 0} un.</td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openTransfer(p)}
                        disabled={activePos.length === 0}
                        className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/30 text-sky-500 border border-sky-500/30 rounded-lg text-xs transition flex items-center gap-1 font-medium disabled:opacity-40"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
                      </button>
                      <button
                        onClick={() => openBarcodeModal(p)}
                        className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-500 border border-emerald-500/30 rounded-lg text-xs transition flex items-center gap-1 font-medium"
                      >
                        <ScanBarcode className="w-3.5 h-3.5" /> Códigos
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !isLoadingProducts && (
                <tr>
                  <td colSpan={3 + activePos.length} className={`px-4 py-12 text-center ${c.empty}`}>Nenhum produto encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Transferência */}
      {transferProduct && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-md`}>
            <div className={`p-5 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-sky-500" /> Transferir para PDV
              </h3>
              <button onClick={() => setTransferProduct(null)} className={c.muted}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <span className={`block ${c.muted}`}>Produto</span>
                <span className={`text-sm font-bold block ${c.strong}`}>{transferProduct.name}</span>
                <span className="text-[11px] font-mono text-sky-500 block">Estoque geral disponível: {transferProduct.generalStock} un.</span>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>PDV de destino</label>
                <select value={targetPos} onChange={(e) => setTargetPos(e.target.value)} className={c.field}>
                  {activePos.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={c.label}>Quantidade</label>
                <input
                  type="number"
                  min={1}
                  max={transferProduct.generalStock}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  className={`font-mono ${c.field}`}
                />
              </div>
            </div>
            <div className={`p-5 border-t flex justify-end gap-3 ${c.modalDivider}`}>
              <button onClick={() => setTransferProduct(null)} className={c.ghostBtn}>Cancelar</button>
              <button
                onClick={handleExecuteTransfer}
                disabled={transferSaving || !targetPos || transferQty <= 0 || transferQty > transferProduct.generalStock}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {transferSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Códigos de Barras */}
      {barcodeProduct && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-md`}>
            <div className={`p-5 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-emerald-500" /> Códigos de Barras
              </h3>
              <button onClick={() => setBarcodeProduct(null)} className={c.muted}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                <span className={`text-xs block ${c.muted}`}>Produto</span>
                <span className={`text-sm font-bold block ${c.strong}`}>{barcodeProduct.name}</span>
              </div>
              <p className={`text-[11px] ${c.muted}`}>
                Vincule quantos códigos quiser a este produto. Ao ler qualquer um deles no Lançamento de Consumo do Quarto, este produto é encontrado.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBarcodeInput}
                  onChange={(e) => setNewBarcodeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBarcode(); } }}
                  placeholder="Digite ou leia o código de barras"
                  className={`flex-1 font-mono ${c.field}`}
                />
                <button
                  onClick={handleAddBarcode}
                  disabled={barcodeSaving || !newBarcodeInput.trim()}
                  className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 disabled:opacity-50"
                >
                  {barcodeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
              {barcodeError && <p className="text-[11px] text-rose-500">{barcodeError}</p>}
              <div className={`border rounded-xl overflow-hidden max-h-52 overflow-y-auto ${c.modalDivider}`}>
                {barcodesLoading ? (
                  <div className={`p-4 text-center text-xs flex items-center justify-center gap-2 ${c.muted}`}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </div>
                ) : barcodes.length === 0 ? (
                  <div className={`p-4 text-center text-xs ${c.empty}`}>Nenhum código vinculado ainda.</div>
                ) : (
                  barcodes.map((b) => (
                    <div key={b.id} className={`flex items-center justify-between px-3 py-2 border-b last:border-b-0 ${c.modalDivider}`}>
                      <span className={`font-mono text-xs ${c.strong}`}>{b.code}</span>
                      <button onClick={() => handleRemoveBarcode(b.id)} className="text-rose-500 hover:text-rose-400 p-1 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className={`p-5 border-t flex justify-end ${c.modalDivider}`}>
              <button onClick={() => setBarcodeProduct(null)} className={c.ghostBtn}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
