"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hourglass,
  Plus,
  RefreshCw,
  CheckCircle2,
  BellRing,
  Trash2,
  X,
  Bot,
  UserRound,
  Search,
  Loader2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { useTheme } from "@/context/ThemeContext";

interface WaitlistEntry {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestCpf: string | null;
  roomCategoryId: string;
  roomCategoryName: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  notes: string | null;
  status: "WAITING" | "NOTIFIED" | "CONVERTED" | "EXPIRED" | "CANCELLED";
  source: "MANUAL" | "AI_AGENT";
  operatorName: string | null;
  notifiedAt: string | null;
  convertedReservationId: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  kind: "LODGING" | "EVENT_SPACE";
}

function fmtDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

function timeInQueue(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / (60 * 1000)))}min`;
}

export default function WaitlistPanel({
  onActiveCountChange,
  onOpenReserva,
}: {
  onActiveCountChange?: (n: number) => void;
  onOpenReserva?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [vacancyIds, setVacancyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, vacRes] = await Promise.all([
        fetch("/api/waitlist").then((r) => r.json()),
        fetch("/api/waitlist/vacancies").then((r) => r.json()),
      ]);
      if (listRes.success) {
        setEntries(listRes.entries);
        onActiveCountChange?.(listRes.entries.length);
      }
      if (vacRes.success) setVacancyIds(new Set<string>(vacRes.entryIds));
    } catch {
      setFeedback({ type: "err", text: "Erro ao carregar a fila de espera." });
    } finally {
      setLoading(false);
    }
  }, [onActiveCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  // POST para uma ação da fila (notify/convert). Quando o servidor responde `needsQueueOverride`
  // (há hóspedes mais antigos na frente para a mesma categoria/período), pede confirmação e reenvia
  // com `override: true` — o "furo de fila" fica registrado na trilha de auditoria pelo servidor.
  const postWaitlistAction = async (
    id: string,
    action: "notify" | "convert",
    verb: string,
  ): Promise<any | null> => {
    const send = (override: boolean) =>
      fetch(`/api/waitlist/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(override ? { override: true } : {}),
      }).then((r) => r.json());

    let data = await send(false);
    if (data?.needsQueueOverride) {
      const ahead =
        typeof data.aheadCount === "number" && data.aheadCount > 0
          ? `${data.aheadCount} hóspede(s) na frente na fila`
          : "hóspedes na frente na fila";
      const next = data.nextGuestName ? ` O próximo seria ${data.nextGuestName}.` : "";
      if (!confirm(`Há ${ahead} para esta categoria e período.${next}\n\nFurar a fila e ${verb} este hóspede mesmo assim?`)) {
        return null;
      }
      data = await send(true);
    }
    return data;
  };

  const notify = async (id: string) => {
    setBusyId(id);
    try {
      const data = await postWaitlistAction(id, "notify", "avisar");
      if (data === null) return;
      setFeedback(
        data.success
          ? { type: "ok", text: data.message || "Hóspede avisado." }
          : { type: "err", text: data.error || "Não foi possível avisar." },
      );
      if (data.success) load();
    } finally {
      setBusyId(null);
    }
  };

  const convert = async (id: string) => {
    if (!confirm("Converter esta entrada da fila em uma reserva confirmada?")) return;
    setBusyId(id);
    try {
      const data = await postWaitlistAction(id, "convert", "converter");
      if (data === null) return;
      setFeedback(
        data.success
          ? { type: "ok", text: `Reserva ${data.reservationNumber} criada (quarto ${data.room}).` }
          : { type: "err", text: data.error || "Não foi possível converter." },
      );
      if (data.success) load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta entrada da fila de espera?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/waitlist/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) load();
      else setFeedback({ type: "err", text: data.error || "Erro ao remover." });
    } finally {
      setBusyId(null);
    }
  };

  const card = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const heading = isDark ? "text-white" : "text-slate-900";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const faint = isDark ? "text-slate-500" : "text-slate-400";
  const theadCls = isDark
    ? "bg-[#1E293B]/60 text-slate-400 border-slate-800"
    : "bg-slate-100 text-slate-500 border-slate-200";
  const rowDivide = isDark ? "divide-slate-800/60" : "divide-slate-200";
  const rowHover = isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50";
  const cellStrong = isDark ? "text-slate-200" : "text-slate-700";
  const cellMed = isDark ? "text-slate-300" : "text-slate-600";
  const waitingBadge = isDark
    ? "bg-slate-700/40 text-slate-400 border-slate-600/30"
    : "bg-slate-100 text-slate-500 border-slate-300/60";

  return (
    <div className={`rounded-2xl border overflow-hidden ${card}`}>
      <div className={`p-4 border-b flex items-center justify-between flex-wrap gap-3 ${border}`}>
        <div className="flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-amber-400" />
          <h3 className={`text-sm font-semibold ${heading}`}>Fila de Espera</h3>
          <button
            onClick={load}
            className={`p-1 transition-colors ${muted} ${isDark ? "hover:text-white" : "hover:text-slate-900"}`}
            title="Atualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#0284C7]" : ""}`} />
          </button>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar à fila
        </button>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "ok"
              ? "bg-[#10B981]/15 text-[#10B981]"
              : "bg-[#EF4444]/15 text-[#EF4444]"
          }`}
        >
          {feedback.type === "ok" && <CheckCircle2 className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`text-xs font-mono border-b ${theadCls}`}>
              <th className="p-3.5">#</th>
              <th className="p-3.5">HÓSPEDE</th>
              <th className="p-3.5">CATEGORIA</th>
              <th className="p-3.5">PERÍODO</th>
              <th className="p-3.5">PESSOAS</th>
              <th className="p-3.5">NA FILA</th>
              <th className="p-3.5">SITUAÇÃO</th>
              <th className="p-3.5">AÇÕES</th>
            </tr>
          </thead>
          <tbody className={`divide-y text-xs ${rowDivide}`}>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className={`p-8 text-center ${faint}`}>
                  {loading ? "Carregando..." : "Nenhum hóspede na fila de espera."}
                </td>
              </tr>
            ) : (
              entries.map((e, idx) => {
                const hasVacancy = vacancyIds.has(e.id);
                return (
                  <tr key={e.id} className={`transition-colors ${rowHover}`}>
                    <td className={`p-3.5 font-mono ${faint}`}>{idx + 1}</td>
                    <td className="p-3.5">
                      <div className={`font-semibold flex items-center gap-1.5 ${heading}`}>
                        {e.source === "AI_AGENT" ? (
                          <Bot className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <UserRound className={`w-3.5 h-3.5 ${faint}`} />
                        )}
                        {e.guestName}
                      </div>
                      <span className={`text-[10px] ${muted}`}>{e.guestEmail || e.guestPhone || "sem contato"}</span>
                      {e.guestEmail && e.guestPhone && (
                        <span className={`block text-[10px] ${muted}`}>{e.guestPhone}</span>
                      )}
                      {e.notes && <span className={`block text-[10px] mt-0.5 ${faint}`}>{e.notes}</span>}
                    </td>
                    <td className={`p-3.5 ${cellStrong}`}>{e.roomCategoryName}</td>
                    <td className={`p-3.5 font-mono ${cellMed}`}>
                      {fmtDate(e.checkInDate)} a {fmtDate(e.checkOutDate)}
                    </td>
                    <td className={`p-3.5 ${cellMed}`}>
                      {e.adults}
                      {e.children > 0 ? ` + ${e.children}` : ""}
                    </td>
                    <td className={`p-3.5 ${muted}`}>{timeInQueue(e.createdAt)}</td>
                    <td className="p-3.5">
                      {e.status === "NOTIFIED" ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[#38BDF8]/15 text-[#0284C7] border border-[#38BDF8]/30 flex items-center gap-1 w-fit">
                          <BellRing className="w-3 h-3" /> Avisado
                        </span>
                      ) : hasVacancy ? (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Vaga disponível
                        </span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[10px] border w-fit block ${waitingBadge}`}>
                          Aguardando
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => notify(e.id)}
                          disabled={busyId === e.id || (!e.guestPhone && !e.guestEmail)}
                          title={
                            e.guestEmail || e.guestPhone
                              ? "Avisar o hóspede (e-mail e WhatsApp)"
                              : "Entrada sem e-mail nem telefone"
                          }
                          className="px-2 py-1 bg-[#25D366]/15 hover:bg-[#25D366]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[#128C7E] border border-[#25D366]/30 rounded text-[11px] transition-colors flex items-center gap-1 font-medium"
                        >
                          <WhatsAppIcon className="w-3 h-3" /> Avisar
                        </button>
                        <button
                          onClick={() => convert(e.id)}
                          disabled={busyId === e.id}
                          title="Criar a reserva a partir desta entrada"
                          className="px-2 py-1 bg-[#0284C7]/15 hover:bg-[#0284C7]/30 disabled:opacity-40 text-[#0284C7] border border-[#0284C7]/30 rounded text-[11px] transition-colors font-medium"
                        >
                          Converter
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          disabled={busyId === e.id}
                          title="Remover da fila"
                          className={`p-1 transition-colors ${faint} hover:text-[#EF4444]`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddToWaitlistModal
          onClose={() => setShowAdd(false)}
          onOpenReserva={
            onOpenReserva
              ? () => {
                  setShowAdd(false);
                  onOpenReserva();
                }
              : undefined
          }
          onSaved={() => {
            setShowAdd(false);
            setFeedback({ type: "ok", text: "Hóspede adicionado à fila de espera." });
            load();
          }}
        />
      )}
    </div>
  );
}

function AddToWaitlistModal({
  onClose,
  onSaved,
  onOpenReserva,
}: {
  onClose: () => void;
  onSaved: () => void;
  onOpenReserva?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    guestCpf: "",
    roomCategoryId: "",
    checkInDate: "",
    checkOutDate: "",
    adults: 1,
    children: 0,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aviso "há quarto livre nesse período" — a fila só faz sentido sem vaga.
  const [vacancyWarning, setVacancyWarning] = useState<string | null>(null);

  // Consulta de CPF (cadastro local → Hub do Desenvolvedor) para preencher os dados do hóspede.
  const [hubLoading, setHubLoading] = useState(false);
  const [hubFeedback, setHubFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Validação de WhatsApp do telefone informado.
  const [wppStatus, setWppStatus] = useState<"idle" | "loading" | "ok" | "no" | "failed">("idle");
  // Último CPF já consultado — evita repetir a busca ao editar outros campos ou reabrir o teclado.
  const lastLookedUpCpf = useRef<string>("");

  useEffect(() => {
    fetch("/api/cadastros/categorias-apartamento")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCategories((d.categories as Category[]).filter((c) => c.kind !== "EVENT_SPACE"));
      })
      .catch(() => {});
  }, []);

  const save = async (force = false) => {
    setError(null);
    if (!force) setVacancyWarning(null);
    if (!form.guestName.trim() || !form.roomCategoryId || !form.checkInDate || !form.checkOutDate) {
      setError("Preencha hóspede, categoria, chegada e saída.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, force }),
      });
      const data = await res.json();
      if (data.success) onSaved();
      else if (data.hasVacancy) setVacancyWarning(data.error || "Há quarto livre nesse período.");
      else setError(data.error || "Erro ao adicionar à fila.");
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form, v: string | number) => {
    if (k === "roomCategoryId" || k === "checkInDate" || k === "checkOutDate") setVacancyWarning(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const fmtCpf = (val: string) => {
    const c = val.replace(/\D/g, "").slice(0, 11);
    if (c.length > 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
    if (c.length > 6) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`;
    if (c.length > 3) return `${c.slice(0, 3)}.${c.slice(3)}`;
    return c;
  };

  // Ao informar o CPF (11 dígitos), busca os dados do hóspede: primeiro no cadastro local do
  // assinante (não gasta cota); se não encontrar, na Hub do Desenvolvedor. Preenche nome, telefone
  // e e-mail automaticamente. Dispara sozinho ao completar o CPF e também pelo botão "Buscar".
  const lookupCpf = async (cpfArg?: string) => {
    const cleanCpf = (cpfArg ?? form.guestCpf).replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setHubFeedback({ type: "err", text: "Digite um CPF válido com 11 dígitos para consultar." });
      return;
    }
    lastLookedUpCpf.current = cleanCpf;
    setHubLoading(true);
    setHubFeedback(null);
    try {
      const localRes = await fetch(`/api/cadastros/hospedes?q=${cleanCpf}`);
      const localData = await localRes.json().catch(() => ({}));
      const existing = (localData.guests || []).find(
        (g: any) => g.cpf?.replace(/\D/g, "") === cleanCpf,
      );
      if (existing) {
        setForm((f) => ({
          ...f,
          guestName: existing.fullName || f.guestName,
          guestPhone: existing.whatsappPhone || existing.phone || f.guestPhone,
          guestEmail: existing.email || f.guestEmail,
        }));
        setWppStatus(existing.hasWhatsapp ? "ok" : "idle");
        setHubFeedback({ type: "ok", text: `Hóspede localizado no cadastro do hotel: ${existing.fullName}.` });
        return;
      }

      const res = await fetch(`/api/stay/hub-consult-cpf?cpf=${cleanCpf}`);
      const result = await res.json().catch(() => ({}));
      if (result.success && result.data) {
        const d = result.data;
        setForm((f) => ({
          ...f,
          guestName: d.nome || f.guestName,
          guestPhone: (Array.isArray(d.telefones) && d.telefones[0]) || f.guestPhone,
          guestEmail: (Array.isArray(d.emails) && d.emails[0]) || f.guestEmail,
        }));
        setWppStatus("idle");
        setHubFeedback({ type: "ok", text: `Dados de "${d.nome}" localizados.` });
      } else if (result.quotaExceeded) {
        setHubFeedback({
          type: "err",
          text: result.message || "O limite de consultas de CPF do hotel foi atingido neste mês.",
        });
      } else if (result.requiresToken || result.serviceDisabled) {
        setHubFeedback({
          type: "err",
          text: "A consulta automática de dados não está disponível no momento.",
        });
      } else {
        // Mensagens curtas/técnicas da Hub (ex.: "NOK") não ajudam o operador.
        const msg = typeof result.message === "string" && result.message.trim().length > 8 ? result.message : "";
        setHubFeedback({ type: "err", text: msg || "Nenhum registro localizado para este CPF." });
      }
    } catch {
      setHubFeedback({ type: "err", text: "Erro ao consultar o CPF." });
    } finally {
      setHubLoading(false);
    }
  };

  // Verifica se o telefone informado tem WhatsApp ativo (via instância uazapi do hotel).
  const verifyWhatsapp = async () => {
    const clean = form.guestPhone.replace(/\D/g, "");
    if (clean.length < 10) {
      setWppStatus("no");
      return;
    }
    setWppStatus("loading");
    try {
      const res = await fetch("/api/uazapi/profile-picture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.guestPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.hasWhatsapp) setWppStatus("ok");
      else if (data.checkFailed) setWppStatus("failed");
      else setWppStatus("no");
    } catch {
      setWppStatus("failed");
    }
  };

  const overlay = isDark ? "bg-slate-950/85 backdrop-blur-md" : "bg-slate-900/50 backdrop-blur-sm";
  const box = isDark ? "bg-[#0F172A] border-slate-800" : "bg-white border-slate-200";
  const border = isDark ? "border-slate-800" : "border-slate-200";
  const heading = isDark ? "text-white" : "text-slate-900";
  const label = isDark ? "text-slate-300" : "text-slate-600";
  const field = isDark
    ? "bg-[#1E293B] border-slate-700 text-white"
    : "bg-white border-slate-300 text-slate-900";
  const closeBtn = isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-700";
  const cancelBtn = isDark
    ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
    : "bg-slate-100 hover:bg-slate-200 text-slate-600";
  const inputCls = `w-full rounded-lg border px-3 py-1.5 text-xs focus:outline-none focus:border-[#0284C7] ${field}`;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto ${overlay}`}>
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col my-auto max-h-[calc(100vh-4rem)] ${box}`}>
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${border}`}>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${heading}`}>
            <Hourglass className="w-4 h-4 text-amber-400" /> Adicionar à fila de espera
          </h3>
          <button onClick={onClose} className={closeBtn}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-[#EF4444]/15 text-[#EF4444] text-xs font-semibold">{error}</div>
          )}

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>CPF do hóspede</label>
            <div className="flex gap-2">
              <input
                value={form.guestCpf}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "").slice(0, 11);
                  set("guestCpf", fmtCpf(e.target.value));
                  if (clean.length === 11) {
                    if (clean !== lastLookedUpCpf.current && !hubLoading) lookupCpf(clean);
                  } else {
                    lastLookedUpCpf.current = "";
                    setHubFeedback(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupCpf();
                  }
                }}
                placeholder="000.000.000-00"
                className={`${inputCls} min-w-0`}
              />
              <button
                type="button"
                onClick={() => lookupCpf()}
                disabled={hubLoading}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                title="Buscar dados do hóspede pelo CPF"
              >
                {hubLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Buscar
              </button>
            </div>
            {hubFeedback && (
              <p
                className={`text-[11px] font-semibold ${
                  hubFeedback.type === "ok" ? "text-[#10B981]" : "text-[#EF4444]"
                }`}
              >
                {hubFeedback.text}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Nome do hóspede *</label>
            <input
              value={form.guestName}
              onChange={(e) => set("guestName", e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Telefone (WhatsApp)</label>
            <div className="flex gap-2">
              <input
                value={form.guestPhone}
                onChange={(e) => {
                  set("guestPhone", e.target.value);
                  setWppStatus("idle");
                }}
                placeholder="(00) 90000-0000"
                className={`${inputCls} min-w-0`}
              />
              <button
                type="button"
                onClick={verifyWhatsapp}
                disabled={wppStatus === "loading" || form.guestPhone.replace(/\D/g, "").length < 10}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/30 disabled:opacity-40 disabled:cursor-not-allowed text-[#128C7E] border border-[#25D366]/30 text-xs font-bold flex items-center gap-1.5"
                title="Verificar se o número tem WhatsApp ativo"
              >
                {wppStatus === "loading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                )}
                Validar
              </button>
            </div>
            {wppStatus === "ok" && (
              <p className="text-[11px] font-semibold text-[#10B981] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Número com WhatsApp ativo.
              </p>
            )}
            {wppStatus === "no" && (
              <p className="text-[11px] font-semibold text-[#EF4444] flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Este número não tem WhatsApp.
              </p>
            )}
            {wppStatus === "failed" && (
              <p className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Não foi possível verificar agora — tente novamente.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>E-mail (para o aviso de vaga)</label>
            <input
              type="email"
              value={form.guestEmail}
              onChange={(e) => set("guestEmail", e.target.value)}
              placeholder="hospede@email.com"
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Categoria desejada *</label>
            <select
              value={form.roomCategoryId}
              onChange={(e) => set("roomCategoryId", e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Chegada *</label>
              <input
                type="date"
                value={form.checkInDate}
                onChange={(e) => set("checkInDate", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Saída *</label>
              <input
                type="date"
                value={form.checkOutDate}
                onChange={(e) => set("checkOutDate", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Adultos</label>
              <input
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) => set("adults", Number(e.target.value) || 1)}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-xs font-semibold ${label}`}>Crianças</label>
              <input
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => set("children", Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className={`text-xs font-semibold ${label}`}>Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className={inputCls}
            />
          </div>
        </div>

        {vacancyWarning && (
          <div className="px-4 py-3 border-t border-amber-500/30 bg-amber-500/10 shrink-0 space-y-2">
            <p className="text-[11px] font-semibold text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {vacancyWarning}
            </p>
            <div className="flex justify-end gap-2">
              {onOpenReserva && (
                <button
                  onClick={onOpenReserva}
                  className="px-3 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-bold"
                >
                  Lançar reserva
                </button>
              )}
              <button
                onClick={() => save(true)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${cancelBtn}`}
              >
                {saving ? "Salvando…" : "Adicionar mesmo assim"}
              </button>
            </div>
          </div>
        )}

        <div className={`p-4 border-t flex justify-end gap-2 shrink-0 ${border}`}>
          <button
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${cancelBtn}`}
          >
            Cancelar
          </button>
          <button
            onClick={() => save()}
            disabled={saving || !!vacancyWarning}
            className="px-4 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white text-xs font-bold"
          >
            {saving ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
