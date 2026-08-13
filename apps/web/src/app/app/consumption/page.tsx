"use client";

import { useState } from "react";
import { ShoppingBag, Plus, Search, CheckCircle2, BedDouble, Coffee, Beer, Wine, Utensils, CreditCard, Trash2 } from "lucide-react";

export default function TenantConsumptionPage() {
  const [selectedRoomNumber, setSelectedRoomNumber] = useState("102");
  const [selectedCategory, setSelectedCategory] = useState("TODOS");

  const [products] = useState([
    { id: "P-01", name: "Água Mineral 500ml", category: "FRIGOBAR", price: 6.00, icon: "water" },
    { id: "P-02", name: "Cerveja Heineken Long Neck", category: "FRIGOBAR", price: 14.00, icon: "beer" },
    { id: "P-03", name: "Refrigerante Coca-Cola Lata", category: "FRIGOBAR", price: 8.00, icon: "drink" },
    { id: "P-04", name: "Vinho Red Reserva 750ml", category: "FRIGOBAR", price: 95.00, icon: "wine" },
    { id: "P-05", name: "Porção de Batata Frita", category: "RESTAURANTE", price: 38.00, icon: "food" },
    { id: "P-06", name: "Café da Manhã Avulso", category: "RESTAURANTE", price: 45.00, icon: "food" },
    { id: "P-07", name: "Serviço de Lavanderia Express", category: "SERVICOS", price: 50.00, icon: "service" },
  ]);

  const [cart, setCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([
    { id: "P-01", name: "Água Mineral 500ml", price: 6.00, qty: 2 },
    { id: "P-02", name: "Cerveja Heineken Long Neck", price: 14.00, qty: 1 },
  ]);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const totalCartAmount = cart.reduce((acc, item) => acc + item.price * item.qty, 0);

  const handleConfirmConsumption = () => {
    if (cart.length === 0) return;
    setSuccessMessage(`Consumo de R$ ${totalCartAmount.toFixed(2)} lançado com sucesso na conta do Quarto ${selectedRoomNumber}!`);
    setCart([]);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#38BDF8]" />
            Lançamento de Consumo de Frigobar & Serviços
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Debite itens consumidos diretamente no apartamento ocupado ou fature no PDV.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-300">Apartamento Destino:</label>
          <select
            value={selectedRoomNumber}
            onChange={(e) => setSelectedRoomNumber(e.target.value)}
            className="bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-[#0284C7]"
          >
            <option value="102">Quarto 102 - Marcos Oliveira</option>
            <option value="103">Quarto 103 - Mariana Souza</option>
            <option value="203">Quarto 203 - Vale S.A. (João)</option>
          </select>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/40 text-[#10B981] text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Catalog & Cart Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Product Catalog */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedCategory("TODOS")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === "TODOS" ? "bg-[#0284C7] text-white" : "bg-[#0F172A] text-slate-400 border border-slate-800"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setSelectedCategory("FRIGOBAR")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === "FRIGOBAR" ? "bg-[#0284C7] text-white" : "bg-[#0F172A] text-slate-400 border border-slate-800"
                }`}
              >
                Frigobar
              </button>
              <button
                onClick={() => setSelectedCategory("RESTAURANTE")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === "RESTAURANTE" ? "bg-[#0284C7] text-white" : "bg-[#0F172A] text-slate-400 border border-slate-800"
                }`}
              >
                Restaurante / Bar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products
              .filter((p) => selectedCategory === "TODOS" || p.category === selectedCategory)
              .map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addToCart(prod)}
                  className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-[#0284C7] transition-all cursor-pointer space-y-2 group"
                >
                  <span className="text-[10px] font-mono text-[#0284C7] bg-[#0284C7]/15 px-2 py-0.5 rounded border border-[#0284C7]/30">
                    {prod.category}
                  </span>
                  <h4 className="text-xs font-semibold text-white group-hover:text-[#38BDF8] transition-colors line-clamp-1">{prod.name}</h4>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span className="font-mono text-sm font-bold text-white">R$ {prod.price.toFixed(2)}</span>
                    <Plus className="w-4 h-4 text-[#0284C7] group-hover:scale-110 transition-transform" />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Right Column: Active Cart / Bill Summary */}
        <div className="rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-col justify-between p-5 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-[#0284C7]" />
                Conta Quarto {selectedRoomNumber}
              </h3>
              <span className="text-xs font-mono text-slate-400">{cart.length} itens</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.id} className="p-2.5 rounded-lg bg-[#1E293B]/60 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-white block">{item.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">{item.qty}x R$ {item.price.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white">R$ {(item.price * item.qty).toFixed(2)}</span>
                    <button onClick={() => removeFromCart(item.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {cart.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">Nenhum item selecionado.</div>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total do Lançamento:</span>
              <span className="font-mono text-base font-bold text-[#10B981]">R$ {totalCartAmount.toFixed(2)}</span>
            </div>

            <button
              onClick={handleConfirmConsumption}
              disabled={cart.length === 0}
              className={`w-full py-2.5 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 ${
                cart.length > 0 ? "bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-lg shadow-[#0284C7]/20" : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> Lançar na Conta do Apartamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
