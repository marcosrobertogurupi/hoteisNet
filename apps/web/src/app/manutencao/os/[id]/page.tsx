"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Loader2, Wrench, Clock, Play, Hourglass, CheckCircle2, X } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { satelliteAppUI } from "@/lib/satelliteAppUI";
import { resizeImageFile } from "@/lib/resizeImage";
import {
  MAINTENANCE_FUNNEL,
  MAINTENANCE_STAGE_LABEL,
  formatMaintenanceDateTime,
  formatMaintenanceDuration,
  type MaintenanceStageValue,
} from "@/lib/maintenanceShared";
import { useMaintenanceMe, MaintenanceLoading, MaintenanceLogin } from "@/components/manutencao/app/useMaintenanceMe";

interface Ticket {
  id: string;
  number: number;
  stage: MaintenanceStageValue;
  description: string;
  openedAt: string;
  openedByName: string;
  expectedReleaseAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  roomNumber: string;
  floor: string;
  problemType: string;
  waitReasonId: string | null;
  waitReason: string | null;
  nextStages: MaintenanceStageValue[];
  events: { id: string; type: string; toStage: MaintenanceStageValue | null; note: string | null; actorName: string; createdAt: string; waitReason: string | null }[];
  photos: { id: string; url: string | null; createdAt: string; actorName: string }[];
}

type Sheet = null | "WAITING" | "RESOLVED";

// Valor inicial do campo de previsão (datetime-local): amanhã às 12:00, no relógio local.
function defaultForecast(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`;
}

export default function ManutencaoOsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { theme } = useTheme();
  const ui = satelliteAppUI(theme.isDark, "amber");
  const { me, checked, reload } = useMaintenanceMe();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reasons, setReasons] = useState<{ id: string; name: string }[]>([]);
  const [reasonId, setReasonId] = useState("");
  const [forecast, setForecast] = useState(defaultForecast());
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/manutencao-app/os/${id}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "OS não encontrada.");
        return;
      }
      setError(null);
      setTicket(data.ticket);
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
    }
  }, [id]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  };

  const advance = async (etapa: MaintenanceStageValue, extra: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/manutencao-app/os/${id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa, ...extra }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Não foi possível atualizar a OS.");
        return;
      }
      setSheet(null);
      setNote("");
      showFlash(etapa === "RESOLVED" ? "OS resolvida! O quarto foi para a limpeza." : `OS em "${MAINTENANCE_STAGE_LABEL[etapa]}".`);
      await load();
    } catch {
      setError("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const openWaiting = async () => {
    setSheet("WAITING");
    setReasonId(ticket?.waitReasonId || "");
    setForecast(defaultForecast());
    setNote("");
    if (reasons.length === 0) {
      try {
        const res = await fetch("/api/manutencao-app/opcoes");
        const data = await res.json();
        if (data.success) setReasons(data.waitReasons || []);
      } catch {
        /* o envio mostra o erro */
      }
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await resizeImageFile(file);
      const form = new FormData();
      form.append("foto", blob, "foto.jpg");
      const res = await fetch(`/api/manutencao-app/os/${id}/fotos`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Não foi possível enviar a foto.");
        return;
      }
      showFlash("Foto registrada.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  };

  if (!checked) return <MaintenanceLoading />;
  if (!me) return <MaintenanceLogin onLoggedIn={reload} />;

  const isOpen = !!ticket && ["OPEN", "EVALUATING", "WAITING"].includes(ticket.stage);
  const stageIndex = ticket ? MAINTENANCE_FUNNEL.indexOf(ticket.stage) : -1;
  const field = `w-full border rounded-2xl px-4 py-3 text-base focus:outline-none focus:border-amber-500 ${ui.field}`;

  return (
    <div className="min-h-screen pb-28">
      <div className={`sticky top-0 z-10 backdrop-blur border-b px-4 py-3 flex items-center gap-3 ${ui.bar}`}>
        <button onClick={() => router.push("/manutencao")} className={`p-2.5 rounded-xl border ${ui.iconBtn}`} title="Voltar">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <p className={`text-sm font-bold leading-tight truncate ${theme.textMain}`}>
            {ticket ? `Quarto ${ticket.roomNumber} · OS nº ${ticket.number}` : "Ordem de serviço"}
          </p>
          <p className={`text-[11px] ${theme.textMuted}`}>{ticket?.floor || "Manutenção"}</p>
        </div>
      </div>

      {flash && (
        <div className="fixed top-16 left-4 right-4 z-20 rounded-2xl bg-emerald-600 text-white text-sm font-bold px-4 py-3 shadow-lg text-center">
          {flash}
        </div>
      )}

      <div className="px-4 py-5 space-y-4">
        {error && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600">{error}</div>
        )}

        {!ticket && !error && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        )}

        {ticket && (
          <>
            {/* Funil */}
            <div className="grid grid-cols-4 gap-1.5">
              {MAINTENANCE_FUNNEL.map((s, i) => (
                <div
                  key={s}
                  className={`rounded-xl border px-1.5 py-2 text-center text-[10px] font-bold leading-tight ${
                    i === stageIndex
                      ? "bg-amber-600 border-amber-500 text-white"
                      : i < stageIndex
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600"
                        : `${ui.cardSubtle} ${ui.faint}`
                  }`}
                >
                  {i + 1}. {MAINTENANCE_STAGE_LABEL[s]}
                </div>
              ))}
            </div>

            {/* Problema */}
            <div className={`rounded-2xl border p-4 space-y-2 ${ui.card}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${ui.accentText}`}>
                <Wrench className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                {ticket.problemType}
              </p>
              <p className={`text-base font-semibold ${theme.textMain}`}>{ticket.description}</p>
              <div className={`text-xs space-y-1 ${theme.textMuted}`}>
                <p>
                  Aberta por {ticket.openedByName} em {formatMaintenanceDateTime(ticket.openedAt, true)}
                </p>
                <p className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {ticket.resolvedAt
                    ? `Ficou parado ${formatMaintenanceDuration(new Date(ticket.resolvedAt).getTime() - new Date(ticket.openedAt).getTime())}`
                    : `Parado há ${formatMaintenanceDuration(Date.now() - new Date(ticket.openedAt).getTime())}`}
                </p>
                {ticket.stage === "WAITING" && (
                  <p className="font-semibold text-sky-600">
                    {ticket.waitReason}
                    {ticket.expectedReleaseAt ? ` · previsão ${formatMaintenanceDateTime(ticket.expectedReleaseAt)}` : ""}
                  </p>
                )}
              </div>
              {ticket.resolutionNotes && (
                <div className={`pt-2 border-t ${ui.divider}`}>
                  <p className={`text-[11px] font-bold uppercase ${ui.faint}`}>O que foi feito</p>
                  <p className={`text-sm whitespace-pre-wrap ${theme.textMain}`}>{ticket.resolutionNotes}</p>
                </div>
              )}
            </div>

            {/* Fotos */}
            <div className={`rounded-2xl border p-4 space-y-3 ${ui.card}`}>
              <div className="flex items-center justify-between">
                <p className={`text-xs font-bold uppercase tracking-wide ${ui.faint}`}>Fotos ({ticket.photos.length})</p>
                {isOpen && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {uploading ? "Enviando..." : "Fotografar"}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
              </div>
              {ticket.photos.length === 0 ? (
                <p className={`text-xs ${theme.textMuted}`}>Nenhuma foto ainda. Fotografe o problema para deixar registrado.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {ticket.photos.map((p) =>
                    p.url ? (
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="Foto do problema" className="w-full aspect-square object-cover rounded-xl border border-slate-400/30" />
                      </a>
                    ) : (
                      <div key={p.id} className={`w-full aspect-square rounded-xl border ${ui.cardSubtle}`} />
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Linha do tempo */}
            <div className={`rounded-2xl border p-4 space-y-2 ${ui.card}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${ui.faint}`}>Andamento</p>
              <ol className="space-y-2.5">
                {ticket.events.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${theme.textMain}`}>
                        {e.type === "OPENED"
                          ? "OS aberta"
                          : e.type === "REASSIGNED"
                            ? "OS passada para outro colaborador"
                            : e.type === "CANCELLED"
                              ? "OS cancelada"
                              : e.toStage
                                ? MAINTENANCE_STAGE_LABEL[e.toStage]
                                : "Atualização"}
                        {e.waitReason ? ` · ${e.waitReason}` : ""}
                      </p>
                      {e.note && <p className={`text-xs whitespace-pre-wrap ${theme.textMuted}`}>{e.note}</p>}
                      <p className={`text-[11px] ${ui.faint}`}>
                        {formatMaintenanceDateTime(e.createdAt)} · {e.actorName}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>

      {/* Ações da etapa (rodapé fixo) */}
      {ticket && isOpen && (
        <div className={`fixed bottom-0 left-0 right-0 z-10 border-t px-4 py-3 space-y-2 ${ui.bar}`}>
          {ticket.nextStages.includes("EVALUATING") && (
            <button
              onClick={() => advance("EVALUATING")}
              disabled={busy}
              className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Play className="w-5 h-5" /> {ticket.stage === "OPEN" ? "Comecei a avaliar" : "Voltei ao serviço"}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {ticket.nextStages.includes("WAITING") && (
              <button
                onClick={openWaiting}
                disabled={busy}
                className="py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <Hourglass className="w-4 h-4" /> {ticket.stage === "WAITING" ? "Mudar espera" : "Aguardando"}
              </button>
            )}
            {ticket.nextStages.includes("RESOLVED") && (
              <button
                onClick={() => {
                  setResolution("");
                  setSheet("RESOLVED");
                }}
                disabled={busy}
                className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" /> Resolvido
              </button>
            )}
          </div>
        </div>
      )}

      {/* Folhas (bottom sheets) das etapas com dados */}
      {sheet && ticket && (
        <div className="fixed inset-0 z-30 bg-black/60 flex items-end justify-center">
          <div className={`w-full sm:max-w-md border-t rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto ${ui.sheet}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold ${theme.textMain}`}>
                {sheet === "WAITING" ? "Aguardando o quê?" : "O que foi feito no quarto?"}
              </h3>
              <button onClick={() => setSheet(null)} className={`p-2 ${theme.textMuted}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <p className="text-sm text-rose-500 font-medium">{error}</p>}

            {sheet === "WAITING" ? (
              <>
                <div className="space-y-2">
                  {reasons.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setReasonId(r.id)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border text-sm font-semibold ${
                        reasonId === r.id ? "bg-sky-600 border-sky-600 text-white" : `${ui.cardSubtle} ${theme.textMain}`
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
                <div>
                  <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>Previsão de liberação do quarto</label>
                  <input type="datetime-local" value={forecast} onChange={(e) => setForecast(e.target.value)} className={field} />
                  <p className={`text-[11px] mt-1 ${ui.faint}`}>Até essa data o quarto fica fora de venda para novas chegadas.</p>
                </div>
                <div>
                  <label className={`text-xs font-semibold block mb-1.5 ${theme.textMuted}`}>Observação (opcional)</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${field} resize-none`} placeholder="Ex: resistência 7500W encomendada" />
                </div>
                <button
                  onClick={() => {
                    if (!reasonId) return setError("Escolha o motivo da espera.");
                    if (!forecast) return setError("Informe a previsão de liberação.");
                    advance("WAITING", { motivoId: reasonId, previsao: forecast, observacao: note });
                  }}
                  disabled={busy}
                  className="w-full py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-base disabled:opacity-60"
                >
                  {busy ? "Salvando..." : "Confirmar"}
                </button>
              </>
            ) : (
              <>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  className={`${field} resize-none`}
                  placeholder="Ex: Troquei a resistência do chuveiro e testei a água quente."
                />
                <p className={`text-[11px] ${ui.faint}`}>
                  Ao confirmar, a OS é encerrada e o quarto vai para a limpeza antes de voltar a receber hóspede.
                </p>
                <button
                  onClick={() => {
                    if (resolution.trim().length < 10) return setError("Explique o que foi feito no quarto.");
                    advance("RESOLVED", { oQueFoiFeito: resolution });
                  }}
                  disabled={busy}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base disabled:opacity-60"
                >
                  {busy ? "Salvando..." : "Confirmar resolução"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
