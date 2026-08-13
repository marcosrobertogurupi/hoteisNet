"use client";

import { useState, useEffect } from "react";
import { X, BedDouble, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export interface ApartamentoFormData {
  id?: string;
  numero: string;
  categoria: string;
  andar: string;
  bloco: string;
  camasCasal: number;
  camasSolteiro: number;
  caracteristicas: string[];
  status: "LIVRE" | "OCUPADO" | "MANUTENCAO" | "LIMPEZA";
  observacao: string;
}

interface CadastroApartamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ApartamentoFormData) => void;
  initialData?: ApartamentoFormData | null;
}

const CARACTERISTICAS_OPCOES = [
  "Ar-Condicionado Split",
  "TV a Cabo / Smart TV",
  "Frigobar Abastecido",
  "Banheira Hidromassagem",
  "Sacada com Vista Mar",
  "Wi-Fi de Alta Velocidade",
  "Cofre Eletrônico",
  "Acessível PCD / Rampa",
  "Secador de Cabelo",
  "Mesa de Trabalho",
];

export default function CadastroApartamentoModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CadastroApartamentoModalProps) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [formData, setFormData] = useState<ApartamentoFormData>({
    numero: "",
    categoria: "Standard Solteiro/Casal",
    andar: "1º Andar",
    bloco: "Bloco Principal",
    camasCasal: 1,
    camasSolteiro: 1,
    caracteristicas: ["Ar-Condicionado Split", "TV a Cabo / Smart TV", "Frigobar Abastecido"],
    status: "LIVRE",
    observacao: "",
  });

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        numero: "",
        categoria: "Standard Solteiro/Casal",
        andar: "1º Andar",
        bloco: "Bloco Principal",
        camasCasal: 1,
        camasSolteiro: 1,
        caracteristicas: ["Ar-Condicionado Split", "TV a Cabo / Smart TV", "Frigobar Abastecido"],
        status: "LIVRE",
        observacao: "",
      });
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const toggleCaracteristica = (item: string) => {
    setFormData((prev) => {
      const exists = prev.caracteristicas.includes(item);
      if (exists) {
        return { ...prev, caracteristicas: prev.caracteristicas.filter((c) => c !== item) };
      } else {
        return { ...prev, caracteristicas: [...prev.caracteristicas, item] };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.numero.trim()) {
      alert("Por favor, preencha o Número da UH / Apartamento.");
      return;
    }
    onSave(formData);
  };

  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600 shadow-sm";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] ${
        isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
      }`}>
        <div className={`p-6 border-b flex items-center justify-between ${
          isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-50/90"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-3 border rounded-2xl ${
              isDark ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-teal-50 border-teal-200 text-teal-600"
            }`}>
              <BedDouble className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {initialData ? "Editar Apartamento / UH" : "Novo Cadastro de Apartamento (UH)"}
              </h2>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                WinDev Form: Win_Apartamentos / Qry_AptoCaract
              </p>
            </div>
          </div>

          <button onClick={onClose} className={`p-2 rounded-xl transition ${
            isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
          }`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Nº do Quarto / UH <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: 101, 202, 305"
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Categoria / Tipo de UH</label>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                className={inputClass}
              >
                <option value="Standard Solteiro/Casal">Standard (1 Casal + 1 Solteiro)</option>
                <option value="Standard Casal">Standard Casal</option>
                <option value="Luxo Varanda">Luxo com Varanda</option>
                <option value="Suíte Executiva">Suíte Executiva</option>
                <option value="Suíte Presidencial com Hidro">Suíte Presidencial com Hidro</option>
                <option value="Quarto Família Tríplo">Quarto Família Tríplo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Andar</label>
              <input
                type="text"
                placeholder="Ex: 1º Andar"
                value={formData.andar}
                onChange={(e) => setFormData({ ...formData, andar: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Bloco / Torre</label>
              <input
                type="text"
                placeholder="Ex: Bloco A"
                value={formData.bloco}
                onChange={(e) => setFormData({ ...formData, bloco: e.target.value })}
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Camas de Casal</label>
              <input
                type="number"
                min={0}
                value={formData.camasCasal}
                onChange={(e) => setFormData({ ...formData, camasCasal: parseInt(e.target.value) || 0 })}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Camas de Solteiro</label>
              <input
                type="number"
                min={0}
                value={formData.camasSolteiro}
                onChange={(e) => setFormData({ ...formData, camasSolteiro: parseInt(e.target.value) || 0 })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Status Atual da UH</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className={`${inputClass} font-bold`}
            >
              <option value="LIVRE" className="text-emerald-600 font-bold">🟩 Livre & Limpo (Pronto para Check-in)</option>
              <option value="OCUPADO" className="text-rose-600 font-bold">🟥 Ocupado com Hóspede</option>
              <option value="LIMPEZA" className="text-amber-600 font-bold">🟨 Em Limpeza / Higienização</option>
              <option value="MANUTENCAO" className="text-slate-600 font-bold">⬜ Em Manutenção Técnica</option>
            </select>
          </div>

          {/* Característica Checkboxes */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block">
              Características & Equipamentos (WinDev Qry_AptoCaract)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CARACTERISTICAS_OPCOES.map((item) => {
                const isChecked = formData.caracteristicas.includes(item);
                return (
                  <label
                    key={item}
                    onClick={() => toggleCaracteristica(item)}
                    className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition ${
                      isChecked
                        ? isDark ? "bg-teal-500/15 border-teal-500/40 text-teal-300" : "bg-teal-50 border-teal-300 text-teal-800 font-bold"
                        : isDark ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                    />
                    {item}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>Observações Internas</label>
            <textarea
              rows={3}
              placeholder="Instruções de governança, detalhes da suíte..."
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className={`pt-4 border-t flex items-center justify-end gap-3 ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl border text-xs font-semibold transition ${
                isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/20 transition"
            >
              <Check className="w-4 h-4" /> Salvar Apartamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
