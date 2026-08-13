"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Filter, Search, Edit3, Check } from "lucide-react";

export interface TariffItem {
  id: string;
  name: string;
  adults: number;
  price: number;
}

export const INITIAL_TARIFFS: TariffItem[] = [
  { id: "TAR-001", name: "APTO LUXO INDIVIDUAL", adults: 1, price: 190.00 },
  { id: "TAR-002", name: "APTO LUXO DUPLO", adults: 2, price: 260.00 },
  { id: "TAR-003", name: "APTO ESPECIAL INDIVIDUAL", adults: 1, price: 170.00 },
  { id: "TAR-004", name: "APTO ESPECIAL DUPLO", adults: 2, price: 230.00 },
  { id: "TAR-005", name: "APTO STANDAR INDIVIDUAL", adults: 1, price: 150.00 },
  { id: "TAR-006", name: "APTO STANDAR DUPLO", adults: 2, price: 210.00 },
  { id: "TAR-007", name: "SUITE MASTER", adults: 2, price: 520.00 },
  { id: "TAR-008", name: "REPRESENTANTE", adults: 1, price: 140.00 },
  { id: "TAR-009", name: "APTO LUXO TRIPLO", adults: 3, price: 310.00 },
  { id: "TAR-010", name: "APTO ESPECIAL TRIPLO", adults: 3, price: 280.00 },
];

interface CadastroTarifasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTariff?: (tariff: TariffItem) => void;
}

export default function CadastroTarifasModal({
  isOpen,
  onClose,
  onSelectTariff,
}: CadastroTarifasModalProps) {
  const [tariffs, setTariffs] = useState<TariffItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");

  const syncTariffsFromDatabase = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/tariffs`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.tariffs)) return;

      setTariffs((prevList) => {
        const prevMap = new Map(prevList.map((t) => [t.id, t]));

        const updatedList: TariffItem[] = data.tariffs.map((t: any) => {
          const existing = prevMap.get(t.id);
          const nameStr = t.name;
          const adultsNum = t.adults || 1;
          const priceNum = typeof t.price === "number" ? t.price : parseFloat(t.price || "0");

          if (existing) {
            if (existing.name === nameStr && existing.adults === adultsNum && existing.price === priceNum) {
              return existing;
            }
            return { ...existing, name: nameStr, adults: adultsNum, price: priceNum };
          }

          return {
            id: t.id,
            name: nameStr,
            adults: adultsNum,
            price: priceNum,
          };
        });

        return updatedList;
      });
    } catch (err) {
      console.warn("[CadastroTarifas] Erro na sincronização transparente:", err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    syncTariffsFromDatabase();
    const interval = setInterval(syncTariffsFromDatabase, 3000);
    return () => clearInterval(interval);
  }, [isOpen, syncTariffsFromDatabase]);

  // Create / Edit Sub-modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingTariff, setEditingTariff] = useState<TariffItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formAdults, setFormAdults] = useState<number>(1);
  const [formPrice, setFormPrice] = useState<number>(170);

  // Keybindings F2 to Include and DEL to Delete
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        handleOpenCreateForm();
      } else if (e.key === "Delete" && selectedId) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedId, tariffs]);

  if (!isOpen) return null;

  const handleOpenCreateForm = () => {
    setEditingTariff(null);
    setFormName("");
    setFormAdults(1);
    setFormPrice(150);
    setShowFormModal(true);
  };

  const handleOpenEditForm = (t: TariffItem) => {
    setEditingTariff(t);
    setFormName(t.name);
    setFormAdults(t.adults);
    setFormPrice(t.price);
    setShowFormModal(true);
  };

  const handleSaveForm = () => {
    if (!formName.trim()) {
      alert("Informe o nome da tarifa.");
      return;
    }

    if (editingTariff) {
      // Update existing
      setTariffs((prev) =>
        prev.map((item) =>
          item.id === editingTariff.id
            ? { ...item, name: formName.toUpperCase(), adults: formAdults, price: formPrice }
            : item
        )
      );
    } else {
      // Create new
      const newTariff: TariffItem = {
        id: `TAR-${Math.floor(1000 + Math.random() * 9000)}`,
        name: formName.toUpperCase(),
        adults: formAdults,
        price: formPrice,
      };
      setTariffs((prev) => [...prev, newTariff]);
      setSelectedId(newTariff.id);
    }

    setShowFormModal(false);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) {
      alert("Selecione uma tarifa para excluir.");
      return;
    }
    const item = tariffs.find((t) => t.id === selectedId);
    if (!item) return;

    if (confirm(`Tem certeza que deseja excluir a tarifa "${item.name}"?`)) {
      setTariffs((prev) => prev.filter((t) => t.id !== selectedId));
      setSelectedId(null);
    }
  };

  const filteredTariffs = tariffs.filter(
    (t) =>
      t.name.toLowerCase().includes(filterText.toLowerCase()) ||
      t.adults.toString().includes(filterText) ||
      t.price.toString().includes(filterText)
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Main Window Frame matching Print 3 */}
      <div className="bg-white text-slate-900 border border-slate-300 rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col font-sans">
        
        {/* Title Bar */}
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-[#00b4d8] rounded-sm flex items-center justify-center text-white text-[9px] font-bold">
              T
            </div>
            <h2 className="font-bold text-slate-800 text-sm">Tarifas</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 hover:bg-slate-200 p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Window Content Body */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto bg-slate-50">
          
          {/* Quick Search / Filter Bar */}
          <div className="flex items-center justify-between gap-3 bg-white p-2 border border-slate-200 rounded">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar tarifário..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded focus:outline-none focus:border-[#00b4d8]"
              />
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Total: {filteredTariffs.length} tarifas
            </span>
          </div>

          {/* Tarifas Table - Styled exact to Print 3 */}
          <div className="border border-slate-300 rounded bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#00b4d8] text-white font-semibold text-xs border-b border-[#0096c7]">
                  <th className="py-2 px-4 border-r border-[#0096c7]/50 w-7/12">
                    <div className="flex items-center justify-between">
                      <span>Tarifas</span>
                      <Filter className="w-3 h-3 text-white/80" />
                    </div>
                  </th>
                  <th className="py-2 px-4 border-r border-[#0096c7]/50 text-center w-2/12">
                    <div className="flex items-center justify-center gap-1">
                      <Filter className="w-3 h-3 text-white/80" />
                      <span>Qtd.Adulto</span>
                      <Search className="w-3 h-3 text-white/80 ml-1" />
                    </div>
                  </th>
                  <th className="py-2 px-4 text-right w-3/12">
                    <div className="flex items-center justify-end gap-1">
                      <span>Valor apto</span>
                      <Search className="w-3 h-3 text-white/80 ml-1" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredTariffs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400 font-sans text-xs">
                      Nenhuma tarifa encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredTariffs.map((t) => {
                    const isSelected = selectedId === t.id;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        onDoubleClick={() => {
                          if (onSelectTariff) {
                            onSelectTariff(t);
                            onClose();
                          } else {
                            handleOpenEditForm(t);
                          }
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[#e0f7fa] text-slate-900 font-bold"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <td className="py-2 px-4 border-r border-slate-100 font-sans uppercase font-medium">
                          {t.name}
                        </td>
                        <td className="py-2 px-4 text-center border-r border-slate-100 font-mono">
                          {t.adults}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-slate-800">
                          R$ {t.price.toFixed(2).replace(".", ",")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Action Buttons Section matching Print 3 */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleOpenCreateForm}
              className="px-6 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-xs rounded transition-all shadow-md active:scale-95 flex items-center gap-1.5"
            >
              [F2] Incluir
            </button>

            <button
              onClick={handleDeleteSelected}
              disabled={!selectedId}
              className="px-6 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-xs rounded transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              [DEL] Excluir
            </button>

            {onSelectTariff && selectedId && (
              <button
                onClick={() => {
                  const sel = tariffs.find((t) => t.id === selectedId);
                  if (sel) {
                    onSelectTariff(sel);
                    onClose();
                  }
                }}
                className="ml-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition-all shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Selecionar Tarifa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modal: Form for Adding / Editing Tariff */}
      {showFormModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-300 w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingTariff ? "Editar Tarifa" : "Incluir Nova Tarifa"}
              </h3>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome da Tarifa (Descrição)</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: APTO LUXO TRIPLO"
                  className="w-full border border-slate-300 rounded p-2 text-slate-900 font-medium uppercase focus:outline-none focus:border-[#00b4d8]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Quantidade de Adultos (Qtd.Adulto)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formAdults}
                  onChange={(e) => setFormAdults(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded p-2 text-slate-900 font-mono focus:outline-none focus:border-[#00b4d8]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Valor da Diária / Apto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formPrice}
                  onChange={(e) => setFormPrice(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded p-2 text-slate-900 font-mono focus:outline-none focus:border-[#00b4d8]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setShowFormModal(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded hover:bg-slate-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveForm}
                className="px-5 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold rounded shadow-sm"
              >
                Salvar Tarifa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
