"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ArrowRightLeft, Building2, ShoppingBag, Plus, RefreshCw, AlertTriangle, CheckCircle2, Search, Filter } from "lucide-react";

export default function TenantStockPage() {
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [transferQty, setTransferQty] = useState(10);
  const [targetPos, setTargetPos] = useState("PDV_FRIGOBAR");
  const [notification, setNotification] = useState<string | null>(null);

  const [products, setProducts] = useState<any[]>([]);

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
    }
  }, []);

  useEffect(() => {
    syncStockFromDatabase();
    const interval = setInterval(syncStockFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [syncStockFromDatabase]);

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
                  <button
                    onClick={() => {
                      setSelectedProduct(p);
                      setShowTransferModal(true);
                    }}
                    className="px-3 py-1.5 bg-[#0284C7]/20 hover:bg-[#0284C7]/40 text-[#38BDF8] border border-[#0284C7]/40 rounded text-xs transition-colors flex items-center gap-1 font-medium"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir para PDV
                  </button>
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
    </div>
  );
}
