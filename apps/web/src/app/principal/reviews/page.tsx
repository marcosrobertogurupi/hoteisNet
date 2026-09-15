"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, RefreshCw, CheckCircle2, AlertTriangle, Circle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";

type ReviewChannel = "GOOGLE_MAPS" | "TRIPADVISOR" | "BOOKING" | "FACEBOOK" | "INSTAGRAM" | "RECLAME_AQUI";
type ConnectorStatus = "PENDING_AUTH" | "ACTIVE" | "PAUSED" | "ERROR" | "RUNNING";

interface Connector {
  channel: ReviewChannel;
  status: ConnectorStatus;
  externalId: string | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  errorMessage: string | null;
}

interface ReviewItem {
  id: string;
  channel: ReviewChannel;
  rating: string | null;
  title: string | null;
  body: string | null;
  authorName: string | null;
  url: string | null;
  publishedAt: string;
  sentiment: string;
  responseStatus: string;
}

// Rótulo, ajuda de configuração e exemplo mostrados no card de cada canal. "help" explica qual
// identificador o assinante precisa colar — cada canal usa um formato diferente (ver
// apps/worker/src/reviewConnectors/*.ts para o que cada um espera).
const CHANNEL_INFO: Record<ReviewChannel, { label: string; help: string; placeholder: string; implemented: boolean }> = {
  GOOGLE_MAPS: {
    label: "Google Maps",
    help: "Cole o Place ID do seu hotel no Google Maps.",
    placeholder: "Ex: ChIJN1t_tDeuEmsRUsoyG83frY4",
    implemented: true,
  },
  TRIPADVISOR: {
    label: "TripAdvisor",
    help: "Cole a URL completa da página do hotel no TripAdvisor.",
    placeholder: "https://www.tripadvisor.com.br/Hotel_Review-...",
    implemented: true,
  },
  BOOKING: {
    label: "Booking.com",
    help: "Canal ainda não disponível para coleta — chega numa próxima etapa do módulo.",
    placeholder: "URL do hotel no Booking.com",
    implemented: false,
  },
  FACEBOOK: {
    label: "Facebook",
    help: "Canal ainda não disponível para coleta — chega numa próxima etapa do módulo.",
    placeholder: "URL da página do Facebook",
    implemented: false,
  },
  INSTAGRAM: {
    label: "Instagram",
    help: "Canal ainda não disponível para coleta — chega numa próxima etapa do módulo.",
    placeholder: "@usuário do Instagram",
    implemented: false,
  },
  RECLAME_AQUI: {
    label: "Reclame Aqui",
    help: "Canal ainda não disponível para coleta — chega numa próxima etapa do módulo.",
    placeholder: "Slug da empresa no Reclame Aqui",
    implemented: false,
  },
};

const STATUS_INFO: Record<ConnectorStatus, { label: string; color: string }> = {
  PENDING_AUTH: { label: "Não configurado", color: "text-slate-400" },
  ACTIVE: { label: "Ativo", color: "text-emerald-500" },
  PAUSED: { label: "Pausado", color: "text-slate-400" },
  ERROR: { label: "Com erro", color: "text-rose-500" },
  RUNNING: { label: "Sincronizando...", color: "text-sky-500" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ReviewsPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const { user } = useSession();
  const toast = useToast();
  const isAdmin = user ? ["SUPER_ADMIN", "TENANT_ADMIN"].includes(user.role) : false;

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [editingChannel, setEditingChannel] = useState<ReviewChannel | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingChannel, setSavingChannel] = useState<ReviewChannel | null>(null);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState<ReviewChannel | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const PAGE_SIZE = 30;

  const syncConnectors = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/tenant/reviews/connectors");
      const data = await res.json();
      if (data?.success) setConnectors(data.connectors);
    } catch (err) {
      console.warn("[Reviews] Erro ao buscar conectores:", err);
    }
  }, [isAdmin]);

  const syncReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (channelFilter) params.set("channel", channelFilter);
      const res = await fetch(`/api/tenant/reviews?${params.toString()}`);
      const data = await res.json();
      if (data?.success) {
        setReviews(data.reviews);
        setTotal(data.total);
      }
    } catch (err) {
      console.warn("[Reviews] Erro ao buscar reviews:", err);
    } finally {
      setLoadingReviews(false);
    }
  }, [page, channelFilter]);

  useEffect(() => {
    syncConnectors();
  }, [syncConnectors]);

  useEffect(() => {
    syncReviews();
  }, [syncReviews]);

  const handleOpenEdit = (c: Connector) => {
    setEditingChannel(c.channel);
    setEditingValue(c.externalId || "");
  };

  const handleSaveConnector = async (channel: ReviewChannel) => {
    if (!editingValue.trim()) {
      toast.warning("Informe o identificador do negócio no canal.");
      return;
    }
    setSavingChannel(channel);
    try {
      const res = await fetch("/api/tenant/reviews/connectors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, externalId: editingValue.trim() }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.error || "Não foi possível salvar o canal.");
        return;
      }
      toast.success("Canal configurado — a coleta começa no próximo ciclo automático.");
      setEditingChannel(null);
      syncConnectors();
    } catch (err) {
      console.error("[Reviews] Erro ao salvar conector:", err);
      toast.error("Erro de conexão ao salvar o canal.");
    } finally {
      setSavingChannel(null);
    }
  };

  const cardClass = isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const inputClass = isDark
    ? "w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500"
    : "w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-600 shadow-sm";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className={`flex items-center gap-4 p-6 rounded-3xl border shadow-xl ${cardClass}`}>
          <div className={`p-3.5 border rounded-2xl ${isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-600"}`}>
            <Star className="w-8 h-8" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Reviews & Reputação
            </h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Reviews coletados automaticamente dos canais configurados abaixo.
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className={`p-5 rounded-2xl border space-y-4 ${cardClass}`}>
            <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Canais monitorados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectors.map((c) => {
                const info = CHANNEL_INFO[c.channel];
                const status = STATUS_INFO[c.status];
                const isEditing = editingChannel === c.channel;
                return (
                  <div key={c.channel} className={`p-4 rounded-2xl border space-y-2 ${isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{info.label}</span>
                      <span className={`text-[11px] font-semibold flex items-center gap-1 ${status.color}`}>
                        {c.status === "ACTIVE" && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {c.status === "ERROR" && <AlertTriangle className="w-3.5 h-3.5" />}
                        {c.status === "RUNNING" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {c.status === "PENDING_AUTH" && <Circle className="w-3.5 h-3.5" />}
                        {status.label}
                      </span>
                    </div>

                    {!info.implemented && !isEditing && (
                      <p className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>{info.help}</p>
                    )}

                    {info.implemented && !isEditing && (
                      <>
                        <p className={`text-[11px] truncate ${isDark ? "text-slate-400" : "text-slate-600"}`} title={c.externalId || undefined}>
                          {c.externalId ? `ID: ${c.externalId}` : info.help}
                        </p>
                        <p className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                          Última coleta: {formatDate(c.lastSyncAt)}
                        </p>
                        {c.errorMessage && <p className="text-[11px] text-rose-500 truncate" title={c.errorMessage}>{c.errorMessage}</p>}
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${isDark ? "bg-slate-800 text-teal-400 hover:bg-teal-600 hover:text-white" : "bg-slate-100 text-teal-700 hover:bg-teal-600 hover:text-white"}`}
                        >
                          {c.externalId ? "Reconfigurar" : "Configurar"}
                        </button>
                      </>
                    )}

                    {info.implemented && isEditing && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          autoFocus
                          placeholder={info.placeholder}
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSaveConnector(c.channel)}
                          className={inputClass}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveConnector(c.channel)}
                            disabled={savingChannel === c.channel}
                            className="flex-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition"
                          >
                            {savingChannel === c.channel ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            onClick={() => setEditingChannel(null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={`border rounded-3xl overflow-hidden shadow-xl ${cardClass}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setChannelFilter(null); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${!channelFilter ? "bg-teal-600 text-white" : isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}
              >
                Todos
              </button>
              {(Object.keys(CHANNEL_INFO) as ReviewChannel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => { setChannelFilter(ch); setPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${channelFilter === ch ? "bg-teal-600 text-white" : isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}
                >
                  {CHANNEL_INFO[ch].label}
                </button>
              ))}
            </div>
            <button onClick={syncReviews} className={`p-2 rounded-xl transition ${isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} title="Atualizar">
              <RefreshCw className={`w-4 h-4 ${loadingReviews ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
            {reviews.map((r) => (
              <div key={r.id} className="px-5 py-4 space-y-1.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
                      {CHANNEL_INFO[r.channel].label}
                    </span>
                    {r.rating !== null && (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                        <Star className="w-3.5 h-3.5 fill-amber-500" /> {r.rating}
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{r.authorName || "Anônimo"}</span>
                  </div>
                  <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>{formatDate(r.publishedAt)}</span>
                </div>
                {r.body && <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>{r.body}</p>}
              </div>
            ))}

            {!loadingReviews && reviews.length === 0 && (
              <div className="px-5 py-16 text-center space-y-2">
                <Star className="w-8 h-8 text-slate-400 mx-auto" />
                <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {isAdmin ? "Nenhum review coletado ainda — configure um canal acima." : "Nenhum review coletado ainda."}
                </p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800/60">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={`p-2 rounded-lg disabled:opacity-40 ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className={`p-2 rounded-lg disabled:opacity-40 ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
