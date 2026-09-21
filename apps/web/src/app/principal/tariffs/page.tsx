"use client";

import { useState } from "react";
import { Plus, Trash2, Search, Filter, DollarSign, Layers } from "lucide-react";
import CadastroTarifasModal, { INITIAL_TARIFFS, TariffItem } from "@/components/CadastroTarifasModal";

export default function TariffsPage() {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [tariffs, setTariffs] = useState<TariffItem[]>(INITIAL_TARIFFS);

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2.5 tracking-tight">
            <DollarSign className="w-7 h-7 text-[#00b4d8]" />
            Cadastro de Tarifas do Assinante
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie a tabela de tarifas por quantidade de adultos e categorias de acomodação para aplicação automática no check-in e alteração de hospedagens.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
        >
          <Layers className="w-4 h-4" />
          Abrir Gerenciador de Tarifas (Print 3)
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 space-y-2">
          <span className="text-xs font-semibold text-slate-400 block">Total de Tarifas Ativas</span>
          <span className="text-3xl font-extrabold text-white font-mono">{tariffs.length}</span>
          <span className="text-[11px] text-emerald-400 block">✓ Prontas para Check-in</span>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 space-y-2">
          <span className="text-xs font-semibold text-slate-400 block">Tarifa Menor Diária</span>
          <span className="text-3xl font-extrabold text-white font-mono">
            R$ {Math.min(...tariffs.map((t) => t.price)).toFixed(2).replace(".", ",")}
          </span>
          <span className="text-[11px] text-slate-400 block">REPRESENTANTE / STANDAR</span>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 space-y-2">
          <span className="text-xs font-semibold text-slate-400 block">Tarifa Maior Diária</span>
          <span className="text-3xl font-extrabold text-[#00b4d8] font-mono">
            R$ {Math.max(...tariffs.map((t) => t.price)).toFixed(2).replace(".", ",")}
          </span>
          <span className="text-[11px] text-slate-400 block">SUITE MASTER DUPLO</span>
        </div>
      </div>

      {/* Main Tariff Modal (Active by default or on button click) */}
      <CadastroTarifasModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
