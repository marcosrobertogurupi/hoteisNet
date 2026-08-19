"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ArrowRightLeft, Building2, ShoppingBag, Plus, RefreshCw, AlertTriangle, CheckCircle2, Search, Filter, ScanBarcode, Trash2, X, Loader2 } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";

interface ProductBarcode {
  id: string;
  code: string;
}

export default function TenantStockPage() {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [transferQty, setTransferQty] = useState(10);
  const [targetPos, setTargetPos] = useState("PDV_FRIGOBAR");
  const [notification, setNotification] = useState<string | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  const [products, setProducts] = useState<any[]>([]);

  // Gestão de códigos de barras vinculados a um produto (vários códigos podem apontar para o
  // mesmo produto; qualquer um deles resolve para ele no Lançamento de Consumo do Quarto).
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<any>(null);
  const [barcodes, setBarcodes] = useState<ProductBarcode[]>([]);
  const [barcodesLoading, setBarcodesLoading] = useState(false);
  const [newBarcodeInput, setNewBarcodeInput] = useState("");
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const syncStockFromDatabase = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.products)) return;

      setProducts((prevList) => {
        const prevMap = new Map(prevList.map((p) => [p.id, p]));

        const updatedList = data.products.map((p: any) => {
          const existing = prevMap.get(p.id);
          const pName = p.name;
          const pCat = p.category || "Geral";
          const gStock = p.generalStock || 20;
          const mStock = p.minStock || 5;
          const cPrice = typeof p.costPrice === "number" ? p.costPrice : parseFloat(p.costPrice || "0");
          const sPrice = typeof p.salePrice === "number" ? p.salePrice : parseFloat(p.salePrice || "0");

          if (existing) {
            if (existing.name === pName && existing.generalStock === gStock && existing.salePrice === sPrice) {
              return existing;
            }
            return {
              ...existing,
              name: pName,
              category: pCat,
              generalStock: gStock,
              minStock: mStock,
              costPrice: cPrice,
              salePrice: sPrice,
            };
          }

          return {
            id: p.id,
            name: pName,
            category: pCat,
            generalStock: gStock,
            minStock: mStock,
            costPrice: cPrice,
            salePrice: sPrice,
            posStocks: {
              PDV_RECEPCAO: Math.floor(gStock * 0.1),
              PDV_FRIGOBAR: Math.floor(gStock * 0.3),
              PDV_RESTAURANTE: Math.floor(gStock * 0.2),
              PDV_PISCINA: Math.floor(gStock * 0.05),
            },
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[ControleEstoque] Erro na sincronização transparente:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    syncStockFromDatabase();
    const interval = setInterval(syncStockFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncStockFromDatabase]);

  const openBarcodeModal = async (product: any) => {
    setBarcodeProduct(product);
    setShowBarcodeModal(true);
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
      // mantém removido na tela; próxima abertura do modal resincroniza com o servidor
    }
  };

  const handleExecuteTransfer = () => {
    if (!selectedProduct || transferQty <= 0) return;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === selectedProduct.id) {
          const currentPosStock = (p.posStocks as any)[targetPos] || 0;
          return {
            ...p,
            generalStock: p.generalStock - transferQty,
            posStocks: {
              ...p.posStocks,
              [targetPos]: currentPosStock + Number(transferQty),
            },
          };
        }
        return p;
      })
    );

    const targetPosName =
      targetPos === "PDV_RECEPCAO"
        ? "Recepção / Balcão"
        : targetPos === "PDV_FRIGOBAR"
        ? "Almoxarifado Frigobar"
        : targetPos === "PDV_RESTAURANTE"
        ? "Restaurante Central"
        : "Bar da Piscina";

    setNotification(`Transferência de ${transferQty} un. de "${selectedProduct.name}" do Estoque Geral para ${targetPosName} realizada!`);
    setShowTransferModal(false);

    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoadingProducts} message="Buscando estoque..." submessage="Estamos carregando os dados mais recentes do estoque." />

      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-[#0284C7]" />
            Controle de Estoque Multi-PDV (Estoque Geral vs. Pontos de Venda)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gestão fracionada de produtos: Almoxarifado Central, Recepção, Central de Frigobar, Restaurante e Bar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-lg bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 font-medium text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Baixa Automática no Consumo
          </span>
        </div>
      </div>

      {/* Realtime Notification Alert */}
      {notification && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notification}</span>
        </div>
      )}

      {/* POS Locations Legend Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium block">Almoxarifado Central</span>
          <span className="text-xl font-bold font-mono text-[#0284C7] block">595 Unidades</span>
          <span className="text-[10px] text-slate-500 block">Estoque Geral de Depósito</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium block">PDV Frigobar (Governança)</span>
          <span className="text-xl font-bold font-mono text-[#F59E0B] block">152 Unidades</span>
          <span className="text-[10px] text-slate-500 block">Estoque para Reposição</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium block">PDV Restaurante / Bar</span>
          <span className="text-xl font-bold font-mono text-[#10B981] block">112 Unidades</span>
          <span className="text-[10px] text-slate-500 block">Estoque do Salão</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1">
          <span className="text-xs text-slate-400 font-medium block">PDV Recepção / Conveniência</span>
          <span className="text-xl font-bold font-mono text-[#38BDF8] block">57 Unidades</span>
          <span className="text-[10px] text-slate-500 block">Venda Balcão Rápida</span>
        </div>
      </div>

      {/* Multi-Stock Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Quadro de Estoque Geral e Fracionado por PDV</h3>
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Buscar produto no estoque..."
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#0284C7]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
              <th className="p-3.5">PRODUTO / CATEGORIA</th>
              <th className="p-3.5">ESTOQUE GERAL (CENTRAL)</th>
              <th className="p-3.5">ESTOQUE FRIGOBAR</th>
              <th className="p-3.5">ESTOQUE RESTAURANTE</th>
              <th className="p-3.5">ESTOQUE RECEPÇÃO</th>
              <th className="p-3.5">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5">
                  <div className="font-semibold text-white">{p.name}</div>
                  <span className="text-[10px] font-mono text-slate-500">{p.category} • Venda: R$ {p.salePrice.toFixed(2)}</span>
                </td>
                <td className="p-3.5 font-mono">
                  <span className="font-bold text-[#0284C7] text-sm">{p.generalStock} un.</span>
                  <span className="text-[10px] text-slate-500 block">Min: {p.minStock} un.</span>
                </td>
                <td className="p-3.5 font-mono text-amber-400 font-semibold">{p.posStocks.PDV_FRIGOBAR} un.</td>
                <td className="p-3.5 font-mono text-emerald-400 font-semibold">{p.posStocks.PDV_RESTAURANTE} un.</td>
                <td className="p-3.5 font-mono text-sky-400 font-semibold">{p.posStocks.PDV_RECEPCAO} un.</td>
                <td className="p-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedProduct(p);
                        setShowTransferModal(true);
                      }}
                      className="px-3 py-1.5 bg-[#0284C7]/20 hover:bg-[#0284C7]/40 text-[#38BDF8] border border-[#0284C7]/40 rounded text-xs transition-colors flex items-center gap-1 font-medium"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir para PDV
                    </button>
                    <button
                      onClick={() => openBarcodeModal(p)}
                      className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/40 rounded text-xs transition-colors flex items-center gap-1 font-medium"
                    >
                      <ScanBarcode className="w-3.5 h-3.5" /> Códigos de Barras
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Stock Transfer (Estoque Geral -> PDV Target) */}
      {showTransferModal && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#0284C7]" />
                Transferência para Ponto de Venda (PDV)
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[#1E293B]/70 border border-slate-800 space-y-1">
                <span className="text-slate-400 block">Produto Selecionado:</span>
                <span className="text-sm font-bold text-white block">{selectedProduct.name}</span>
                <span className="text-[11px] font-mono text-[#0284C7] block">Estoque Geral Disponível: {selectedProduct.generalStock} unidades</span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">PDV de Destino</label>
                <select
                  value={targetPos}
                  onChange={(e) => setTargetPos(e.target.value)}
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0284C7]"
                >
                  <option value="PDV_FRIGOBAR">Almoxarifado Frigobar (Governança)</option>
                  <option value="PDV_RESTAURANTE">Restaurante & Bar Central</option>
                  <option value="PDV_RECEPCAO">Recepção / Conveniência Balcão</option>
                  <option value="PDV_PISCINA">Bar da Piscina</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Quantidade a Transferir</label>
                <input
                  type="number"
                  min={1}
                  max={selectedProduct.generalStock}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 font-mono text-sm text-white focus:outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteTransfer}
                className="px-4 py-2 bg-[#0284C7] text-white text-sm rounded-lg font-medium hover:bg-[#0369A1]"
              >
                Confirmar Transferência
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Códigos de Barras (vários códigos podem apontar para o mesmo produto) */}
      {showBarcodeModal && barcodeProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-emerald-400" />
                Códigos de Barras do Produto
              </h3>
              <button onClick={() => setShowBarcodeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#1E293B]/70 border border-slate-800">
              <span className="text-slate-400 text-xs block">Produto:</span>
              <span className="text-sm font-bold text-white block">{barcodeProduct.name}</span>
            </div>

            <p className="text-[11px] text-slate-400">
              Vincule quantos códigos de barras quiser a este produto. Ao ler qualquer um deles no Lançamento de Consumo do Quarto, este produto será encontrado.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBarcodeInput}
                  onChange={(e) => setNewBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddBarcode();
                    }
                  }}
                  placeholder="Digite ou leia o código de barras"
                  className="flex-1 bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleAddBarcode}
                  disabled={barcodeSaving || !newBarcodeInput.trim()}
                  className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 disabled:opacity-50"
                  title="Adicionar código de barras"
                >
                  {barcodeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
              {barcodeError && <p className="text-[11px] text-red-400">{barcodeError}</p>}
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
              {barcodesLoading ? (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                </div>
              ) : barcodes.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">Nenhum código de barras vinculado ainda.</div>
              ) : (
                barcodes.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-slate-800 last:border-b-0 hover:bg-slate-800/40"
                  >
                    <span className="font-mono text-xs text-slate-200">{b.code}</span>
                    <button
                      onClick={() => handleRemoveBarcode(b.id)}
                      className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/40"
                      title="Remover vínculo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowBarcodeModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
