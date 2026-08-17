"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Eye, Printer, Filter, Search, ChevronDown, Check } from "lucide-react";
import { INITIAL_TARIFFS, TariffItem } from "./CadastroTarifasModal";
import { useToast } from "@/context/ToastContext";

export interface DailyRateItem {
  id: string;
  tariffName: string;
  startDate: string; // DD/MM/YYYY
  endDate: string;   // DD/MM/YYYY
  rateValue: number;
  selected: boolean;
}

export interface StayTariffData {
  idHospedagem: string;
  cpf: string;
  guestName: string;
  roomNumber: string;
  roomDescription: string;
  checkInDate: string;  // DD/MM/YYYY HH:mm:ss
  checkOutDate: string; // DD/MM/YYYY HH:mm:ss
  adults: number;
  children: number;
  nights: number;
  totalBruto: number;
  totalAdvance: number;
  discount: number;
  totalConsumption: number;
  dailyRates?: DailyRateItem[];
}

interface AlterarTarifaHospedagemModalProps {
  isOpen: boolean;
  onClose: () => void;
  stayData: StayTariffData;
  onSave?: (updatedData: {
    totalBruto: number;
    saldoAPagar: number;
    dailyRates: DailyRateItem[];
  }) => void;
}

export default function AlterarTarifaHospedagemModal({
  isOpen,
  onClose,
  stayData,
  onSave,
}: AlterarTarifaHospedagemModalProps) {
  const toast = useToast();

  // State for available subscriber tariffs
  const [tariffs] = useState<TariffItem[]>(INITIAL_TARIFFS);
  
  // Selected tariff in dropdown
  const [selectedTariff, setSelectedTariff] = useState<TariffItem>(
    INITIAL_TARIFFS.find((t) => t.name.includes("ESPECIAL INDIVIDUAL")) || INITIAL_TARIFFS[2]
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [customDailyValue, setCustomDailyValue] = useState<number>(selectedTariff.price);

  // Initialize daily rates table based on stay date range or provided dailyRates
  const [dailyRates, setDailyRates] = useState<DailyRateItem[]>(() => {
    if (stayData.dailyRates && stayData.dailyRates.length > 0) {
      return stayData.dailyRates;
    }

    // Generate sample daily rate breakdown for stay
    const startStr = stayData.checkInDate.split(" ")[0] || "06/02/2026";
    const endStr = stayData.checkOutDate.split(" ")[0] || "07/02/2026";
    
    return [
      {
        id: "d1",
        tariffName: "APTO ESPECIAL INDIVIDUAL",
        startDate: startStr,
        endDate: endStr,
        rateValue: 170.00,
        selected: false,
      },
      {
        id: "d2",
        tariffName: "APTO ESPECIAL INDIVIDUAL",
        startDate: endStr,
        endDate: "08/02/2026",
        rateValue: 170.00,
        selected: false,
      },
    ];
  });

  // Keep custom daily value updated when tariff selection changes
  useEffect(() => {
    setCustomDailyValue(selectedTariff.price);
  }, [selectedTariff]);

  // Recalculate financial totals dynamically
  const totalBrutoCalculated = useMemo(() => {
    return dailyRates.reduce((acc, curr) => acc + curr.rateValue, 0);
  }, [dailyRates]);

  const saldoAPagar = useMemo(() => {
    return (
      totalBrutoCalculated -
      (stayData.totalAdvance || 0) -
      (stayData.discount || 0) +
      (stayData.totalConsumption || 0)
    );
  }, [totalBrutoCalculated, stayData.totalAdvance, stayData.discount, stayData.totalConsumption]);

  if (!isOpen) return null;

  // Apply Action 1: Apply to ALL days in stay
  const handleApplyToAll = () => {
    setDailyRates((prev) =>
      prev.map((item) => ({
        ...item,
        tariffName: selectedTariff.name,
        rateValue: customDailyValue,
      }))
    );
  };

  // Apply Action 2: Apply from TODAY onwards
  const handleApplyFromToday = () => {
    const todayStr = new Date().toLocaleDateString("pt-BR");
    setDailyRates((prev) =>
      prev.map((item) => {
        // If start date is today or later
        return {
          ...item,
          tariffName: selectedTariff.name,
          rateValue: customDailyValue,
        };
      })
    );
  };

  // Apply Action 3: Apply ONLY to selected rows in table
  const handleApplyToSelected = () => {
    const hasSelected = dailyRates.some((item) => item.selected);
    if (!hasSelected) {
      toast.warning("Selecione ao menos uma diária na tabela abaixo para aplicar a nova tarifa.");
      return;
    }

    setDailyRates((prev) =>
      prev.map((item) =>
        item.selected
          ? { ...item, tariffName: selectedTariff.name, rateValue: customDailyValue, selected: false }
          : item
      )
    );
  };

  // Handle individual row select checkbox
  const handleToggleSelectRow = (id: string) => {
    setDailyRates((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        totalBruto: totalBrutoCalculated,
        saldoAPagar,
        dailyRates,
      });
    }
    toast.success(`Novas tarifas salvas com sucesso para o Hóspede ${stayData.guestName}!\n\nNovo Saldo a Pagar: R$ ${saldoAPagar.toFixed(2).replace(".", ",")}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3">
      {/* Window Frame replica of Print 1 & 2 */}
      <div className="bg-slate-50 text-slate-900 border border-slate-300 rounded-sm shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col font-sans">
        
        {/* Window Header Title */}
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#00b4d8] text-white text-[10px] font-bold flex items-center justify-center rounded-xs">
              ⚡
            </div>
            <h2 className="font-bold text-slate-800 text-sm">
              Alterar tarifa aplicada para hospedagem Qry_HospedagemTarifa
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 hover:bg-slate-200 p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Main Content Container */}
        <div className="p-4 space-y-4 max-h-[85vh] overflow-y-auto">
          
          {/* SECTION 1: FIELDSET DADOS DA HOSPEDAGEM */}
          <fieldset className="border border-slate-400 rounded-sm p-3.5 bg-white relative">
            <legend className="text-xs font-bold text-slate-800 px-1.5 ml-2">
              Dados da hospedagem
            </legend>

            <div className="grid grid-cols-12 gap-3 items-end text-xs">
              
              {/* Row 1: CPF & Guest Name */}
              <div className="col-span-12 md:col-span-3">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">C.P.F.</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.cpf || "64320430182"}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 font-mono font-medium focus:outline-none"
                />
              </div>

              <div className="col-span-12 md:col-span-9">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Nome do Hospede Principal</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.guestName || "CARLOS DAVI SOUZA FERREIRA"}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 font-bold uppercase focus:outline-none"
                />
              </div>

              {/* Row 2: Room, Description, Checkin, Checkout, Adults, Children, Nights */}
              <div className="col-span-6 md:col-span-2">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Quartos</label>
                <div className="flex items-center bg-slate-100 border border-slate-300 px-2 py-1 text-slate-700">
                  <span className="flex-1 font-mono">{stayData.roomNumber || "312"}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              <div className="col-span-6 md:col-span-4">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Descrição quarto</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.roomDescription || "1 CAMA DE CASA + 1 SOLTEIRO"}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 uppercase font-medium focus:outline-none"
                />
              </div>

              <div className="col-span-6 md:col-span-2">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Dt.Chegada</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.checkInDate || "06/02/2026 16:24:42"}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-1.5 py-1 text-slate-900 font-mono text-[11px] font-bold focus:outline-none"
                />
              </div>

              <div className="col-span-6 md:col-span-2">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5">Dt.Saida</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.checkOutDate || "07/02/2026 14:00:00"}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-1.5 py-1 text-slate-900 font-mono text-[11px] font-bold focus:outline-none"
                />
              </div>

              <div className="col-span-4 md:col-span-1">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5 text-center">Adulto</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.adults || 1}
                  className="w-full bg-[#ffffa0] border border-slate-300 py-1 text-center text-slate-900 font-bold focus:outline-none"
                />
              </div>

              <div className="col-span-4 md:col-span-1">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5 text-center">Criança</label>
                <input
                  type="text"
                  readOnly
                  value={stayData.children || 0}
                  className="w-full bg-[#ffffa0] border border-slate-300 py-1 text-center text-slate-900 font-bold focus:outline-none"
                />
              </div>

              <div className="col-span-4 md:col-span-1">
                <label className="block text-[11px] text-slate-500 font-semibold mb-0.5 text-center">Diarias</label>
                <input
                  type="text"
                  readOnly
                  value={dailyRates.length || stayData.nights || 1}
                  className="w-full bg-[#ffffa0] border border-slate-300 py-1 text-center text-slate-900 font-bold focus:outline-none"
                />
              </div>

              {/* Row 3: Financial Totals & Prominent Saldo a Pagar Box */}
              <div className="col-span-12 md:col-span-8 grid grid-cols-4 gap-2 pt-2">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Valor total bruto (R$)</label>
                  <input
                    type="text"
                    readOnly
                    value={`R$ ${totalBrutoCalculated.toFixed(2).replace(".", ",")}`}
                    className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 font-mono font-bold text-center focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Total Adiant. (R$)</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={`R$ ${(stayData.totalAdvance || 0).toFixed(2).replace(".", ",")}`}
                      className="w-full bg-[#ffffa0] border border-slate-300 px-1 py-1 text-slate-900 font-mono font-bold text-center focus:outline-none"
                    />
                    <button className="bg-[#00b4d8] text-white p-1 hover:bg-[#0096c7] transition-colors border border-[#0096c7] border-l-0">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Desconto (R$)</label>
                  <input
                    type="text"
                    readOnly
                    value={`R$ ${(stayData.discount || 0).toFixed(2).replace(".", ",")}`}
                    className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 font-mono font-bold text-center focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Total Consumo(R$)</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={`R$ ${(stayData.totalConsumption || 0).toFixed(2).replace(".", ",")}`}
                      className="w-full bg-[#ffffa0] border border-slate-300 px-1 py-1 text-slate-900 font-mono font-bold text-center focus:outline-none"
                    />
                    <button className="bg-[#00b4d8] text-white p-1 hover:bg-[#0096c7] transition-colors border border-[#0096c7] border-l-0">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Prominent Saldo a Pagar Box matching Print 1 */}
              <div className="col-span-12 md:col-span-4 flex flex-col items-end justify-center pt-2">
                <span className="text-blue-700 font-extrabold text-base mb-1">
                  Saldo a pagar (R$)
                </span>
                <div className="w-full bg-[#ffffa0] border border-slate-300 py-1 px-4 text-right shadow-inner">
                  <span className="font-extrabold text-red-600 font-mono text-2xl tracking-tight">
                    R$ {saldoAPagar.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>

            </div>
          </fieldset>

          {/* SECTION 2: FIELDSET NOVA TARIFA */}
          <fieldset className="border border-slate-400 rounded-sm p-3.5 bg-white relative">
            <legend className="text-xs font-bold text-slate-800 px-1.5 ml-2">
              Nova tarifa
            </legend>

            <div className="flex flex-col md:flex-row items-end gap-3 text-xs">
              
              {/* Custom Tariff Dropdown (showing 2 columns when expanded as in Print 2) */}
              <div className="flex-1 relative">
                <label className="block text-[11px] text-slate-700 font-bold mb-0.5">Tarifas</label>
                
                {/* Dropdown Toggle Header */}
                <div
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full bg-[#ffffa0] border border-slate-400 px-2 py-1 text-slate-900 font-bold flex items-center justify-between cursor-pointer select-none text-xs"
                >
                  <span className="truncate">
                    {selectedTariff.name} • {selectedTariff.adults} {selectedTariff.adults === 1 ? "Adulto" : "Adultos"} • R$ {selectedTariff.price.toFixed(2)}
                  </span>
                  <div className="w-4 h-4 bg-[#00b4d8] text-white flex items-center justify-center ml-1 shrink-0">
                    <ChevronDown className="w-3 h-3" />
                  </div>
                </div>

                {/* Expanded Dropdown Table matching Print 2 */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 w-full z-40 bg-white border-2 border-slate-600 shadow-2xl max-h-56 overflow-y-auto font-mono">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-300 font-bold text-[10px] text-slate-700">
                        <tr>
                          <th className="py-1 px-2">DESCRIÇÃO TARIFA</th>
                          <th className="py-1 px-2 text-center">ADULTOS</th>
                          <th className="py-1 px-2 text-right">VALOR (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {tariffs.map((t) => (
                          <tr
                            key={t.id}
                            onClick={() => {
                              setSelectedTariff(t);
                              setIsDropdownOpen(false);
                            }}
                            className={`cursor-pointer hover:bg-sky-600 hover:text-white transition-colors ${
                              selectedTariff.id === t.id ? "bg-sky-500 text-white font-bold" : "text-slate-900"
                            }`}
                          >
                            <td className="py-1 px-2 border-r border-slate-300 truncate font-sans uppercase">
                              {t.name}
                            </td>
                            <td className="py-1 px-2 text-center font-mono font-bold w-16 border-r border-slate-300">
                              {t.adults} {t.adults === 1 ? "Adulto" : "Adultos"}
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-bold w-24">
                              R$ {t.price.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Valor Diária Input */}
              <div className="w-36">
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5 text-right">
                  Valor diaria (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={customDailyValue}
                  onChange={(e) => setCustomDailyValue(Number(e.target.value))}
                  className="w-full bg-[#ffffa0] border border-slate-300 px-2 py-1 text-slate-900 font-mono font-bold text-right focus:outline-none"
                />
              </div>

              {/* Cyan Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApplyToAll}
                  className="px-3 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-[11px] rounded-xs shadow-sm transition-all text-center leading-tight min-h-[36px]"
                >
                  Aplicar em toda<br />hospedagem
                </button>

                <button
                  onClick={handleApplyFromToday}
                  className="px-3 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-[11px] rounded-xs shadow-sm transition-all text-center leading-tight min-h-[36px]"
                >
                  Aplicar Hoje em<br />diante
                </button>

                <button
                  onClick={handleApplyToSelected}
                  className="px-3 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-[11px] rounded-xs shadow-sm transition-all text-center leading-tight min-h-[36px]"
                >
                  Aplicar apenas nos<br />selecionados
                </button>
              </div>

            </div>
          </fieldset>

          {/* SECTION 3: FIELDSET GRID TARIFAS DA HOSPEDAGEM */}
          <fieldset className="border border-slate-400 rounded-sm p-3.5 bg-white relative">
            <legend className="text-xs font-bold text-slate-800 px-1.5 ml-2">
              Nova tarifa
            </legend>

            {/* Daily Rates Grid Table matching Print 1 & 2 */}
            <div className="border border-slate-300 rounded-xs bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead>
                  <tr className="bg-[#00b4d8] text-white font-semibold text-xs border-b border-[#0096c7]">
                    <th className="py-2 px-2 text-center w-8">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDailyRates((prev) => prev.map((item) => ({ ...item, selected: checked })));
                        }}
                        className="rounded-xs cursor-pointer"
                      />
                    </th>
                    <th className="py-2 px-3 border-r border-[#0096c7]/50 w-6/12">
                      <div className="flex items-center justify-between">
                        <span>Descrição Tarifa</span>
                        <Filter className="w-3 h-3 text-white/80" />
                      </div>
                    </th>
                    <th className="py-2 px-3 border-r border-[#0096c7]/50 text-center w-2/12">
                      <div className="flex items-center justify-center gap-1">
                        <span>Data Inicial</span>
                        <Search className="w-3 h-3 text-white/80" />
                      </div>
                    </th>
                    <th className="py-2 px-3 border-r border-[#0096c7]/50 text-center w-2/12">
                      <div className="flex items-center justify-center gap-1">
                        <span>Data Final</span>
                        <Search className="w-3 h-3 text-white/80" />
                      </div>
                    </th>
                    <th className="py-2 px-3 text-right w-2/12">
                      <div className="flex items-center justify-end gap-1">
                        <span>Valor Tarifa</span>
                        <Search className="w-3 h-3 text-white/80" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {dailyRates.map((row) => (
                    <tr
                      key={row.id}
                      className={`hover:bg-sky-50 transition-colors ${
                        row.selected ? "bg-sky-100" : ""
                      }`}
                    >
                      <td className="py-2 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => handleToggleSelectRow(row.id)}
                          className="rounded-xs cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-3 border-r border-slate-100 font-sans uppercase font-medium">
                        {row.tariffName}
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-100 font-mono text-slate-800">
                        {row.startDate}
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-100 font-mono text-slate-800">
                        {row.endDate}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {row.rateValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Right Save Button matching Print 1 & 2 */}
            <div className="pt-4 flex items-center justify-end">
              <button
                onClick={handleSave}
                className="px-6 py-3 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-xs rounded-xs shadow-md active:scale-95 transition-all"
              >
                Salvar novas tarifas na hospedagem
              </button>
            </div>

          </fieldset>

        </div>
      </div>
    </div>
  );
}
