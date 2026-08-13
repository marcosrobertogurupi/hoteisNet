"use client";

import { useState } from "react";
import { Building2, Plus, Search, ShieldCheck, CheckCircle2, Clock, AlertTriangle, FileText, ExternalLink, Filter } from "lucide-react";

export default function SuperAdminTenantsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cadastur, setCadastur] = useState("");
  const [city, setCity] = useState("");
  const [plan, setPlan] = useState("PRO");

  const [tenants, setTenants] = useState([
    { id: "TNT-01", name: "Pousada Sol & Mar", cnpj: "12.345.678/0001-90", cadastur: "19.012345.10.0001-2", city: "Búzios, RJ", plan: "PRO", rooms: 24, maxRooms: 30, status: "ACTIVE", mrr: 490.00, aiTokens: "34.200 / 50.000", cpfQueries: 142, cpfQuota: 500 },
    { id: "TNT-02", name: "Hotel Praia Azul", cnpj: "98.765.432/0001-10", cadastur: "29.987654.10.0001-9", city: "Salvador, BA", plan: "ENTERPRISE", rooms: 85, maxRooms: 150, status: "ACTIVE", mrr: 1290.00, aiTokens: "112.000 / 250.000", cpfQueries: 680, cpfQuota: 2000 },
    { id: "TNT-03", name: "Resort Montanha Real", cnpj: "45.123.890/0001-33", cadastur: "14.451238.10.0001-5", city: "Gramado, RS", plan: "ENTERPRISE", rooms: 120, maxRooms: 200, status: "ACTIVE", mrr: 1890.00, aiTokens: "185.400 / 250.000", cpfQueries: 1420, cpfQuota: 2000 },
    { id: "TNT-04", name: "Pousada Cantinho da Serra", cnpj: "67.890.123/0001-55", cadastur: "26.678901.10.0001-8", city: "Campos do Jordão, SP", plan: "STARTER", rooms: 12, maxRooms: 15, status: "TRIAL", mrr: 0.00, aiTokens: "4.100 / 15.000", cpfQueries: 38, cpfQuota: 100 },
    { id: "TNT-05", name: "Hotel Central Executivo", cnpj: "33.444.555/0001-22", cadastur: "33.334445.10.0001-1", city: "São Paulo, SP", plan: "PRO", rooms: 45, maxRooms: 50, status: "OVERDUE", mrr: 690.00, aiTokens: "48.900 / 50.000", cpfQueries: 498, cpfQuota: 500 },
  ]);

  const handleAddTenant = () => {
    if (!name || !cnpj) return;
    const newT = {
      id: `TNT-${Math.floor(10 + Math.random() * 90)}`,
      name,
      cnpj,
      cadastur: cadastur || "20.123456.10.0001-0",
      city: city || "Rio de Janeiro, RJ",
      plan,
      rooms: 15,
      maxRooms: plan === "STARTER" ? 15 : plan === "PRO" ? 50 : 200,
      status: "TRIAL",
      mrr: 0.00,
      aiTokens: "0 / 50.000",
      cpfQueries: 0,
      cpfQuota: plan === "STARTER" ? 100 : plan === "PRO" ? 500 : 2000,
    };

    setTenants([newT, ...tenants]);
    setShowAddModal(false);
    setName("");
    setCnpj("");
    setCadastur("");
    setCity("");
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#F59E0B]" />
            Gestão de Assinantes SaaS & Hotéis Contratantes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle de estabelecimentos cadastrados, status Cadastur, planos vigentes e cotas de uso da API Hub e IA.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-bold text-sm rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-[#F59E0B]/20"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Assinante</span>
        </button>
      </div>

      {/* Tenants Table */}
      <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Filtrar Assinantes</span>
          </div>

          <div className="relative w-72">
            <input
              type="text"
              placeholder="Buscar por nome, cidade ou CNPJ..."
              className="w-full bg-[#1E293B] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#F59E0B]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1E293B]/60 text-slate-400 text-xs font-mono border-b border-slate-800">
              <th className="p-3.5">ESTABELECIMENTO / ID</th>
              <th className="p-3.5">CNPJ & CADASTUR</th>
              <th className="p-3.5">CIDADE / UF</th>
              <th className="p-3.5">PLANO / QUARTOS</th>
              <th className="p-3.5">CONSULTAS CPF (HUB API)</th>
              <th className="p-3.5">RECEITA MRR</th>
              <th className="p-3.5">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="p-3.5">
                  <div className="font-semibold text-white">{t.name}</div>
                  <span className="font-mono text-[10px] text-slate-500">{t.id}</span>
                </td>
                <td className="p-3.5 font-mono text-slate-300">
                  <div>{t.cnpj}</div>
                  <span className="text-[10px] text-[#10B981]">Cadastur: {t.cadastur}</span>
                </td>
                <td className="p-3.5 text-slate-300">{t.city}</td>
                <td className="p-3.5">
                  <span className="font-semibold text-[#0284C7]">{t.plan}</span>
                  <span className="text-slate-400 text-[11px] block">{t.rooms} / {t.maxRooms} acomodações</span>
                </td>
                <td className="p-3.5 font-mono">
                  <div className="font-bold text-sky-400">{t.cpfQueries} / {t.cpfQuota}</div>
                  <span className={`text-[10px] block font-sans font-medium ${
                    t.cpfQueries >= t.cpfQuota ? "text-rose-400 font-bold animate-pulse" : t.cpfQueries >= t.cpfQuota * 0.9 ? "text-amber-400" : "text-slate-400"
                  }`}>
                    {t.cpfQueries >= t.cpfQuota ? "⚠️ Cota Excedida" : `${Math.round((t.cpfQueries / t.cpfQuota) * 100)}% consumido`}
                  </span>
                </td>
                <td className="p-3.5 font-mono font-semibold text-white">R$ {t.mrr.toFixed(2)}</td>
                <td className="p-3.5">
                  {t.status === "ACTIVE" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                      Ativa
                    </span>
                  )}
                  {t.status === "TRIAL" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#0284C7]/15 text-[#38BDF8] border border-[#0284C7]/30">
                      Degustação
                    </span>
                  )}
                  {t.status === "OVERDUE" && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                      Atrasado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal New Tenant Onboarding */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#F59E0B]" />
                Onboarding de Novo Hotel Assinante
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Razão Social / Nome Fantasia</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Pousada Vila dos Ventos"
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">CNPJ do Estabelecimento</label>
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Número Cadastur</label>
                  <input
                    type="text"
                    value={cadastur}
                    onChange={(e) => setCadastur(e.target.value)}
                    placeholder="19.000000.10.0001-0"
                    className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Cidade / UF</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Natal, RN"
                    className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Plano Contratado</label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full bg-[#1E293B] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F59E0B]"
                >
                  <option value="STARTER">Starter (até 15 quartos - R$ 290/mês)</option>
                  <option value="PRO">Pro (até 40 quartos - R$ 490/mês)</option>
                  <option value="ENTERPRISE">Enterprise (até 200 quartos - R$ 1290/mês)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-sm rounded-lg hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddTenant}
                className="px-4 py-2 bg-[#F59E0B] text-slate-950 text-sm rounded-lg font-bold hover:bg-[#D97706]"
              >
                Salvar Assinante
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
