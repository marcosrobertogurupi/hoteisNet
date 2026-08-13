"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Phone,
  Mail,
  Building2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Database,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import CadastroHospedeModal, { HospedeFormData } from "@/components/CadastroHospedeModal";

interface GuestFromDB {
  id: string;
  fullName: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  hasWhatsapp: boolean;
  city: string | null;
  state: string | null;
  country: string;
  street: string | null;
  zipCode: string | null;
  gender: string | null;
  birthDate: string | null;
  companyId: string | null;
  company: { name: string; cnpj: string } | null;
}

interface ApiResponse {
  guests: GuestFromDB[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Converter Guest do banco (snake_case) para o formato do modal (HospedeFormData)
function guestToFormData(guest: GuestFromDB): HospedeFormData {
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
    dtNascimento: guest.birthDate ? guest.birthDate.substring(0, 10) : "",
    cep: guest.zipCode || "",
    logradouro: guest.street || "",
    numero: "",
    complEnder: "",
    bairro: "",
    cidade: guest.city || "",
    uf: guest.state || "",
    pais: guest.country || "Brasil",
    profissao: "",
    nomePai: "",
    nomeMae: "",
    codEmpresa: guest.companyId || "",
    nomeEmpresa: guest.company?.name || "",
    telefones: guest.phone
      ? [{ telefone: guest.phone, descricao: "Celular", telPrincipal: true }]
      : [],
    emails: guest.email
      ? [{ email: guest.email, emailPrincipal: true }]
      : [],
    veiculos: [],
    ocorrencia: "",
  };
}

// Converter HospedeFormData para payload do POST/PUT
function formDataToApiPayload(data: HospedeFormData) {
  return {
    fullName: data.nome,
    cpf: data.cpf || null,
    gender: data.sexo || "M",
    birthDate: data.dtNascimento || null,
    email: data.emails?.[0]?.email || null,
    phone: data.telefones?.[0]?.telefone || null,
    whatsappPhone: data.telefones?.[0]?.telefone || null,
    hasWhatsapp: !!(data.telefones?.[0]?.telefone),
    zipCode: data.cep || null,
    street: data.logradouro || null,
    number: data.numero || null,
    city: data.cidade || null,
    state: data.uf || null,
    country: data.pais || "Brasil",
    companyId: data.codEmpresa || null,
  };
}

const PAGE_SIZE = 50;

export default function HospedesPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [guests, setGuests] = useState<GuestFromDB[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHospede, setEditingHospede] = useState<HospedeFormData | null>(null);

  const fetchGuests = useCallback(async (q: string, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        page: String(pg),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/cadastros/hospedes?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setGuests(data.guests);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch (err: any) {
      setError("Erro ao carregar hóspedes do banco de dados.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca inicial e quando muda a query ou page
  useEffect(() => {
    fetchGuests(searchQuery, page);
  }, [searchQuery, page, fetchGuests]);

  // Debounce do campo de busca
  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearchQuery(value);
    }, 400);
  };

  const handleOpenAdd = () => {
    setEditingHospede(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (guest: GuestFromDB) => {
    setEditingHospede(guestToFormData(guest));
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Deseja excluir o cadastro de "${nome}"?`)) return;
    try {
      const res = await fetch(`/api/cadastros/hospedes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchGuests(searchQuery, page);
    } catch {
      alert("Erro ao excluir hóspede.");
    }
  };

  const handleSaveHospede = async (data: HospedeFormData) => {
    try {
      const payload = formDataToApiPayload(data);

      let res: Response;
      if (data.id) {
        res = await fetch(`/api/cadastros/hospedes/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/cadastros/hospedes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setIsModalOpen(false);
      await fetchGuests(searchQuery, page);
    } catch (err: any) {
      alert(`Erro ao salvar hóspede: ${err.message}`);
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border flex items-center gap-1.5 ${
              isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              <Database className="w-3 h-3" /> Supabase PostgreSQL
            </span>
            <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
              isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-sky-50 text-sky-700 border-sky-200"
            }`}>
              WinDev Win_IncHospede / FNRH
            </span>
          </div>
        </div>

        {/* Page Header */}
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-sky-500/10 border-sky-500/20 text-sky-400" : "bg-sky-50 border-sky-200 text-sky-600"
            }`}>
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Hóspedes
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {loading ? "Carregando..." : `${total.toLocaleString("pt-BR")} hóspedes no banco de dados Supabase`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchGuests(searchQuery, page)}
              disabled={loading}
              className={`p-2.5 rounded-2xl border transition ${
                isDark ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
              }`}
              title="Recarregar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Novo Hóspede (FNRH)
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF, e-mail, telefone ou cidade..."
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-sky-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-600"
              }`}
            />
          </div>

          <div className={`flex items-center justify-end gap-3 text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            <span>
              Exibindo{" "}
              <span className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{guests.length}</span>{" "}
              de{" "}
              <span className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{total.toLocaleString("pt-BR")}</span>{" "}
              hóspedes
            </span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
            isDark ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700"
          }`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-xs font-medium">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`font-mono border-b uppercase tracking-wider ${
                isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                <tr>
                  <th className="px-5 py-3.5">Hóspede / CPF</th>
                  <th className="px-5 py-3.5">Cidade / UF</th>
                  <th className="px-5 py-3.5">Telefone</th>
                  <th className="px-5 py-3.5">E-mail</th>
                  <th className="px-5 py-3.5">Empresa</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <Loader2 className="w-8 h-8 text-sky-500 mx-auto animate-spin" />
                      <p className={`mt-3 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        Carregando dados do Supabase...
                      </p>
                    </td>
                  </tr>
                ) : guests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center space-y-2">
                      <Users className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        {searchQuery ? "Nenhum hóspede encontrado para a busca." : "Nenhum hóspede cadastrado."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  guests.map((g) => (
                    <tr
                      key={g.id}
                      className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <span className={`font-bold text-sm block ${isDark ? "text-white" : "text-slate-900"}`}>
                            {g.fullName}
                          </span>
                          <span className={`font-mono text-[11px] px-2 py-0.5 rounded border inline-block ${
                            isDark ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-sky-50 text-sky-700 border-sky-200"
                          }`}>
                            CPF: {g.cpf || "Não Informado"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5">
                          <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                            {g.city || "-"}
                          </span>
                          <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {[g.state, g.country].filter(Boolean).join(" - ")}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {g.phone ? (
                          <div className={`flex items-center gap-1.5 font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                            <Phone className="w-3.5 h-3.5 text-emerald-500" />
                            {g.phone}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Sem telefone</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {g.email ? (
                          <div className={`flex items-center gap-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                            <Mail className="w-3.5 h-3.5 text-sky-500" />
                            <span className="truncate max-w-[180px]">{g.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Sem e-mail</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {g.company ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${
                            isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            <Building2 className="w-3 h-3" />
                            <span className="max-w-[140px] truncate">{g.company.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(g)}
                            title="Editar Hóspede"
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-sky-400 hover:bg-sky-600 hover:text-white" : "bg-slate-100 text-sky-700 hover:bg-sky-600 hover:text-white"
                            }`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(g.id, g.fullName)}
                            title="Excluir Hóspede"
                            className={`p-2 rounded-xl transition ${
                              isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className={`flex items-center justify-between px-5 py-3 border-t ${
              isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
            }`}>
              <p className={`text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Página <strong>{page}</strong> de <strong>{totalPages}</strong>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className={`p-1.5 rounded-lg transition disabled:opacity-40 ${
                    isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className={`p-1.5 rounded-lg transition disabled:opacity-40 ${
                    isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CadastroHospedeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveHospede}
        initialData={editingHospede}
      />
    </div>
  );
}
