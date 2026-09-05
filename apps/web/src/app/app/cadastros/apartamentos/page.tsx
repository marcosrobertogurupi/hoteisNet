"use client";

import { useState } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/usePolling";
import { 
  BedDouble, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Wrench
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import CadastroApartamentoModal, { ApartamentoFormData } from "@/components/CadastroApartamentoModal";

export default function ApartamentosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [apartamentos, setApartamentos] = useState<ApartamentoFormData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [floorFilter, setFloorFilter] = useState("TODOS");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApto, setEditingApto] = useState<ApartamentoFormData | null>(null);

  // Sincronização automática e transparente dos apartamentos a partir do banco de dados (sem piscamento)
  const syncApartamentosFromDatabase = async () => {
    try {
      const res = await fetch(`/api/reservations/rooms?tenantId=tenant-hoteisnet-demo`);
      const data = await res.json();
      if (!data || !data.success || !Array.isArray(data.rooms)) return;

      setApartamentos((prevAptos) => {
        const prevMap = new Map(prevAptos.map((a) => [a.numero, a]));

        const updated: ApartamentoFormData[] = data.rooms.map((r: any) => {
          const num = String(r.number);
          const existing = prevMap.get(num);

          let st: ApartamentoFormData["status"] = "LIVRE";
          if (r.status === "OCCUPIED" || r.status === "OCCUPIED_CLEANING") st = "OCUPADO";
          else if (r.status === "VACANT_DIRTY") st = "LIMPEZA";
          else if (r.status === "MAINTENANCE") st = "MANUTENCAO";

          const categoryName = r.category || r.room_categories?.name || "Standard";
          const notesStr = r.notes || "";
          const floorStr = r.floor || "1º Andar";
          const blocoStr = r.bloco || "Bloco Principal";
          const casalCount = r.camasCasal ?? 0;
          const solteiroCount = r.camasSolteiro ?? 0;
          const caracteristicasArr =
            Array.isArray(r.caracteristicas) && r.caracteristicas.length > 0
              ? r.caracteristicas
              : ["Ar-Condicionado Split", "TV a Cabo / Smart TV", "Wi-Fi de Alta Velocidade"];
          const fotosArr = Array.isArray(r.photos) ? r.photos : [];

          const candidate: ApartamentoFormData = {
            id: r.id,
            numero: num,
            categoria: categoryName,
            andar: floorStr,
            bloco: blocoStr,
            camasCasal: casalCount,
            camasSolteiro: solteiroCount,
            caracteristicas: caracteristicasArr,
            fotos: fotosArr,
            status: st,
            observacao: notesStr,
          };

          if (
            existing &&
            existing.status === st &&
            existing.categoria === categoryName &&
            existing.observacao === notesStr &&
            existing.andar === floorStr &&
            existing.bloco === blocoStr &&
            existing.camasCasal === casalCount &&
            existing.camasSolteiro === solteiroCount &&
            existing.fotos.length === fotosArr.length
          ) {
            return existing;
          }

          return candidate;
        });

        return updated;
      });
    } catch (err) {
      console.warn("[CadastroApartamentos] Erro na sincronização transparente:", err);
    }
  };

  // Cadastro de apartamentos não muda "sozinho" para quem está nesta tela (as edições locais já
  // aparecem na hora). 30 s de frescor basta; antes eram 3 s. Pausa com a aba em segundo plano.
  usePolling(syncApartamentosFromDatabase, 30000);

  // Lista de andares distintos existentes no cadastro, em ordem natural (1º, 2º, 10º...)
  const andaresDisponiveis = Array.from(
    new Set(apartamentos.map((a) => (a.andar || "").trim()).filter(Boolean))
  ).sort((x, y) => {
    const nx = parseInt(x, 10);
    const ny = parseInt(y, 10);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) return nx - ny;
    return x.localeCompare(y, "pt-BR");
  });

  const filteredAptos = apartamentos.filter((a) => {
    const matchesSearch =
      a.numero.includes(searchQuery) ||
      a.categoria.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.bloco.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "TODOS" || a.status === statusFilter;

    const matchesFloor = floorFilter === "TODOS" || (a.andar || "").trim() === floorFilter;

    return matchesSearch && matchesStatus && matchesFloor;
  });

  const handleOpenAdd = () => {
    setEditingApto(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (a: ApartamentoFormData) => {
    setEditingApto(a);
    setIsModalOpen(true);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const ok = await confirmDialog({
      title: "Excluir Unidade Habitacional",
      message: "Tem certeza que deseja excluir esta Unidade Habitacional (UH)?",
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/reservations/rooms?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível excluir o apartamento.");
        return;
      }
      setApartamentos((prev) => prev.filter((item) => item.id !== id));
      toast.success("Apartamento excluído com sucesso.");
    } catch (err) {
      console.error("[CadastroApartamentos] Erro ao excluir:", err);
      toast.error("Erro de conexão ao excluir o apartamento.");
    }
  };

  const handleSaveApartamento = async (data: ApartamentoFormData) => {
    try {
      const isEditing = Boolean(data.id);
      const res = await fetch("/api/reservations/rooms", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id,
          tenantId: "tenant-hoteisnet-demo",
          numero: data.numero,
          categoria: data.categoria,
          andar: data.andar,
          bloco: data.bloco,
          camasCasal: data.camasCasal,
          camasSolteiro: data.camasSolteiro,
          caracteristicas: data.caracteristicas,
          photos: data.fotos,
          status: data.status,
          observacao: data.observacao,
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar o apartamento.");
        return;
      }

      const savedRoom = result.room;
      const savedApto: ApartamentoFormData = savedRoom
        ? {
            id: savedRoom.id,
            numero: savedRoom.number,
            categoria: savedRoom.category,
            andar: savedRoom.floor,
            bloco: savedRoom.bloco,
            camasCasal: savedRoom.camasCasal,
            camasSolteiro: savedRoom.camasSolteiro,
            caracteristicas: savedRoom.caracteristicas,
            fotos: savedRoom.photos || [],
            status: data.status,
            observacao: savedRoom.notes,
          }
        : data;

      setApartamentos((prev) => {
        if (isEditing) {
          return prev.map((a) => (a.id === savedApto.id ? savedApto : a));
        }
        return [savedApto, ...prev];
      });
      toast.success("Apartamento salvo com sucesso.");
      setIsModalOpen(false);
    } catch (err) {
      console.error("[CadastroApartamentos] Erro ao salvar:", err);
      toast.error("Erro de conexão ao salvar o apartamento.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "LIVRE":
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> LIVRE & PRONTO
          </span>
        );
      case "OCUPADO":
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <BedDouble className="w-3 h-3" /> OCUPADO
          </span>
        );
      case "LIMPEZA":
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> EM LIMPEZA
          </span>
        );
      case "MANUTENCAO":
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-400 text-[10px] font-bold inline-flex items-center gap-1">
            <Wrench className="w-3 h-3" /> MANUTENÇÃO
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/app/cadastros"
            className={`inline-flex items-center gap-2 text-xs font-semibold transition ${
              isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>

          <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
            isDark ? "bg-teal-500/10 text-teal-400 border-teal-500/20" : "bg-teal-50 text-teal-700 border-teal-200"
          }`}>
            Dados Sincronizados
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-teal-50 border-teal-200 text-teal-600"
            }`}>
              <BedDouble className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Apartamentos (UHs)
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Gerenciamento de quartos, andares, capacidade de camas e características (SaaS Multi-tenant).
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-teal-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Apartamento (UH)
          </button>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número do quarto ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-teal-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-teal-600"
              }`}
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white" : "bg-slate-50 border border-slate-300 text-slate-900"
              }`}
            >
              <option value="TODOS">Todos os Status</option>
              <option value="LIVRE">Livre & Limpo</option>
              <option value="OCUPADO">Ocupado</option>
              <option value="LIMPEZA">Em Limpeza</option>
              <option value="MANUTENCAO">Em Manutenção</option>
            </select>
          </div>

          <div>
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white" : "bg-slate-50 border border-slate-300 text-slate-900"
              }`}
            >
              <option value="TODOS">Todos os Andares</option>
              {andaresDisponiveis.map((andar) => (
                <option key={andar} value={andar}>
                  {andar}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-end text-xs font-mono ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            UHs encontradas: <strong className={`ml-1 ${isDark ? "text-white" : "text-slate-900"}`}>{filteredAptos.length}</strong>
          </div>
        </div>

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`font-mono border-b uppercase tracking-wider ${
                isDark ? "bg-slate-950/80 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                <tr>
                  <th className="px-5 py-3.5">Nº Quarto / Categoria</th>
                  <th className="px-5 py-3.5">Localização / Andar</th>
                  <th className="px-5 py-3.5">Capacidade de Camas</th>
                  <th className="px-5 py-3.5">Status Atual</th>
                  <th className="px-5 py-3.5">Características</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filteredAptos.map((a) => (
                  <tr key={a.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {a.fotos && a.fotos.length > 0 ? (
                          <img
                            src={a.fotos[0]}
                            alt={`Foto do quarto ${a.numero}`}
                            className={`w-10 h-10 rounded-lg object-cover border flex-shrink-0 ${isDark ? "border-slate-700" : "border-slate-200"}`}
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${isDark ? "border-slate-800 bg-slate-950 text-slate-600" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                            <BedDouble className="w-4 h-4" />
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <span className={`font-bold text-base block font-mono ${isDark ? "text-white" : "text-slate-900"}`}>Quarto {a.numero}</span>
                          <span className="text-teal-600 dark:text-teal-400 text-[11px] block">{a.categoria}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-0.5">
                        <span className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{a.andar}</span>
                        <span className={`text-[10px] block ${isDark ? "text-slate-400" : "text-slate-500"}`}>{a.bloco}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1 font-mono text-[11px]">
                        <span className={`block ${isDark ? "text-slate-300" : "text-slate-700"}`}>🛏️ {a.camasCasal} Casal</span>
                        <span className={`block ${isDark ? "text-slate-400" : "text-slate-500"}`}>🛌 {a.camasSolteiro} Solteiro</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {getStatusBadge(a.status)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {a.caracteristicas.map((c, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-[10px] ${
                            isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(a)}
                          title="Editar Apartamento"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-teal-400 hover:bg-teal-600 hover:text-white" : "bg-slate-100 text-teal-700 hover:bg-teal-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          title="Excluir Apartamento"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredAptos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 space-y-2">
                      <BedDouble className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhum apartamento encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CadastroApartamentoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveApartamento}
        initialData={editingApto}
      />
    </div>
  );
}
