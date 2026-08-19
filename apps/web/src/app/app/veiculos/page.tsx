"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Car, Search, Eye, Loader2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useSession } from "@/context/SessionContext";
import CadastroHospedeModal, { HospedeFormData } from "@/components/CadastroHospedeModal";

interface VehicleResult {
  id: string;
  placa: string;
  caracteristica: string | null;
  guestId: string;
  guestName: string;
}

type SearchBy = "placa" | "caracteristica";

// Converte o hóspede completo (GET /api/cadastros/hospedes/[id]) para o formato do modal —
// mesma conversão usada em /app/cadastros/hospedes, duplicada aqui pois o formato de origem
// difere (registro único com relations, em vez do item de listagem).
function guestToFormData(guest: any): HospedeFormData {
  return {
    id: guest.id,
    nome: guest.fullName,
    cpf: guest.cpf || "",
    tipoDoc: "RG",
    noDoc: "",
    orgaoExp: "",
    noTitEleitor: "",
    sexo: guest.gender || "M",
    nacionalidade: guest.country || "Brasileira",
    dtNascimento: guest.birthDate ? String(guest.birthDate).substring(0, 10) : "",
    cep: guest.zipCode || "",
    logradouro: guest.street || "",
    numero: guest.number || "",
    complEnder: "",
    bairro: guest.neighborhood || "",
    cidade: guest.city || "",
    uf: guest.state || "",
    pais: guest.country || "Brasil",
    profissao: "",
    nomePai: "",
    nomeMae: "",
    codEmpresa: guest.companyId || "",
    nomeEmpresa: guest.company?.name || "",
    telefones: guest.phone ? [{ telefone: guest.phone, descricao: "Celular", telPrincipal: true }] : [],
    emails: guest.email ? [{ email: guest.email, emailPrincipal: true }] : [],
    veiculos: (guest.vehicles || []).map((v: any) => ({
      id: v.id,
      placaVeiculo: v.placa,
      caractVeic: v.caracteristica || "",
    })),
    ocorrencia: "",
  };
}

function formDataToApiPayload(data: HospedeFormData) {
  return {
    fullName: data.nome,
    cpf: data.cpf || null,
    gender: data.sexo || "M",
    birthDate: data.dtNascimento || null,
    email: data.emails?.[0]?.email || null,
    phone: data.telefones?.[0]?.telefone || null,
    whatsappPhone: data.telefones?.[0]?.telefone || null,
    hasWhatsapp: !!data.telefones?.[0]?.telefone,
    zipCode: data.cep || null,
    street: data.logradouro || null,
    number: data.numero || null,
    neighborhood: data.bairro || null,
    city: data.cidade || null,
    state: data.uf || null,
    country: data.pais || "Brasil",
    companyId: data.codEmpresa || null,
  };
}

export default function BuscaVeiculosPage() {
  const { theme } = useTheme();
  const toast = useToast();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [searchBy, setSearchBy] = useState<SearchBy>("placa");
  const [searchInput, setSearchInput] = useState("");
  const [vehicles, setVehicles] = useState<VehicleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHospede, setEditingHospede] = useState<HospedeFormData | null>(null);
  const [loadingGuestId, setLoadingGuestId] = useState<string | null>(null);

  const fetchVehicles = useCallback(
    async (q: string, by: SearchBy) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q, by, tenantId });
        const res = await fetch(`/api/veiculos/search?${params.toString()}`);
        const data = await res.json();
        if (data.success) setVehicles(data.vehicles);
      } catch (err) {
        console.error("Erro ao buscar veículos:", err);
        toast.error("Erro ao buscar veículos.");
      } finally {
        setLoading(false);
      }
    },
    [tenantId, toast]
  );

  useEffect(() => {
    fetchVehicles(searchInput, searchBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBy]);

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchVehicles(value, searchBy), 400);
  };

  const handleViewGuest = async (guestId: string) => {
    setLoadingGuestId(guestId);
    try {
      const res = await fetch(`/api/cadastros/hospedes/${guestId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const guest = await res.json();
      setEditingHospede(guestToFormData(guest));
      setIsModalOpen(true);
    } catch (err) {
      console.error("Erro ao carregar hóspede:", err);
      toast.error("Erro ao carregar o cadastro do hóspede.");
    } finally {
      setLoadingGuestId(null);
    }
  };

  const handleSaveHospede = async (data: HospedeFormData) => {
    if (!data.id) return;
    try {
      const payload = formDataToApiPayload(data);
      const res = await fetch(`/api/cadastros/hospedes/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await fetch(`/api/cadastros/hospedes/${data.id}/veiculos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculos: data.veiculos }),
      });

      setIsModalOpen(false);
      await fetchVehicles(searchInput, searchBy);
    } catch (err: any) {
      toast.error(`Erro ao salvar hóspede: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div
          style={{ backgroundColor: `${theme.primaryColor}22` }}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        >
          <Car className="w-5 h-5" style={{ color: theme.primaryColor }} />
        </div>
        <div>
          <h1 className={`text-lg font-bold ${theme.textMain}`}>Busca de Veículos</h1>
          <p className={`text-xs ${theme.textMuted}`}>Pesquise pela placa ou pela característica do veículo.</p>
        </div>
      </div>

      {/* Search bar */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center gap-4 ${theme.bgCard}`}>
        <div className="flex items-center gap-4 shrink-0">
          <span className={`text-xs font-bold ${theme.textMuted}`}>Buscar por:</span>
          {(["placa", "caracteristica"] as SearchBy[]).map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
              <input
                type="radio"
                name="searchBy"
                checked={searchBy === opt}
                onChange={() => setSearchBy(opt)}
                style={{ accentColor: theme.primaryColor }}
              />
              <span className={theme.textMain}>{opt === "placa" ? "Placa" : "Característica"}</span>
            </label>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoFocus
            placeholder={searchBy === "placa" ? "Digite a placa..." : "Digite a característica do veículo..."}
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none transition border ${
              theme.isDark
                ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500 focus:border-sky-500"
                : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-600"
            }`}
          />
        </div>
      </div>

      {/* Results table */}
      <div className={`rounded-2xl border overflow-hidden ${theme.bgCard}`}>
        <table className="w-full text-left text-xs">
          <thead
            className={`font-mono border-b uppercase tracking-wider ${
              theme.isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            <tr>
              <th className="px-5 py-3">Placa</th>
              <th className="px-5 py-3">Característica</th>
              <th className="px-5 py-3">Hóspede</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${theme.isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-14 text-center">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin" style={{ color: theme.primaryColor }} />
                </td>
              </tr>
            ) : vehicles.length === 0 ? (
              <tr>
                <td colSpan={4} className={`px-5 py-14 text-center ${theme.textMuted}`}>
                  Nenhum veículo encontrado.
                </td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className={`transition ${theme.isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                  <td className={`px-5 py-3 font-bold ${theme.textMain}`}>{v.placa}</td>
                  <td className={`px-5 py-3 ${theme.textMuted}`}>{v.caracteristica || "-"}</td>
                  <td className={`px-5 py-3 font-medium ${theme.textMain}`}>{v.guestName}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleViewGuest(v.guestId)}
                      disabled={loadingGuestId === v.guestId}
                      title="Visualizar cadastro do hóspede"
                      className={`p-2 rounded-xl transition disabled:opacity-50 ${
                        theme.isDark
                          ? "bg-slate-800 text-sky-400 hover:bg-sky-600 hover:text-white"
                          : "bg-slate-100 text-sky-700 hover:bg-sky-600 hover:text-white"
                      }`}
                    >
                      {loadingGuestId === v.guestId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CadastroHospedeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveHospede}
        initialData={editingHospede}
        initialTab="veiculos"
        readOnly
      />
    </div>
  );
}
