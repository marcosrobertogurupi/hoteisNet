"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Loader2, RotateCw, ShieldAlert, X, IdCard, Cpu } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";
import AiModelSettings from "./AiModelSettings";

const c = cadastroUI(false);

interface TenantCfg {
  id: string;
  name: string;
  tradeName: string | null;
  planName: string | null;
  planAiTokenQuota: number | null;
  cpfQueryQuotaMonthly: number;
  cpfQueryUsed: number;
  cpfQueryEnabled: boolean;
  aiSystemPromptExtra: string;
  aiOperationalPromptExtra: string;
  aiTokenQuotaOverride: number | null;
  aiBlocked: boolean;
}
interface Release {
  buildId: string; forceActive: boolean; forceMatchesCurrent: boolean;
  criticalMessage: string; updatedByName: string | null; updatedAt: string | null;
}

export default function AdminSettingsPage() {
  const toast = useToast();
  const [canEdit, setCanEdit] = useState(false);
  const [tenants, setTenants] = useState<TenantCfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { cpfQuota: string; aiPrompt: string; aiOpPrompt: string; aiOverride: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [release, setRelease] = useState<Release | null>(null);
  const [releaseMsg, setReleaseMsg] = useState("");
  const [savingRelease, setSavingRelease] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => r.json()).then((d) => { if (d?.success) setCanEdit(!!d.user.canEdit); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/tenants?pageSize=100").then((r) => r.json());
      if (d?.success) {
        setTenants(d.tenants);
        setDrafts(Object.fromEntries(d.tenants.map((t: TenantCfg) => [t.id, {
          cpfQuota: String(t.cpfQueryQuotaMonthly),
          aiPrompt: t.aiSystemPromptExtra || "",
          aiOpPrompt: t.aiOperationalPromptExtra || "",
          aiOverride: t.aiTokenQuotaOverride == null ? "" : String(t.aiTokenQuotaOverride),
        }])));
      }
      const r = await fetch("/api/admin/release-control").then((x) => x.json());
      if (r?.success) { setRelease(r); setReleaseMsg(r.criticalMessage || ""); }
    } catch {
      toast.error("Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const patchTenant = async (id: string, data: Record<string, unknown>, okMsg: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const j = await res.json();
      if (j?.success) { toast.success(okMsg); await load(); }
      else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingId(null);
    }
  };

  const releaseAction = async (action: "force" | "clear") => {
    setSavingRelease(true);
    try {
      const res = await fetch("/api/admin/release-control", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, message: releaseMsg }),
      });
      const j = await res.json();
      if (j?.success) { toast.success(action === "force" ? "Atualização crítica forçada." : "Obrigatoriedade cancelada."); await load(); }
      else toast.error(j?.error || "Falha.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingRelease(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /> Carregando…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl"><Settings className="w-7 h-7" /></div>
          <div>
            <h1 className={c.title}>Configuração da Plataforma</h1>
            <p className={c.subtitle}>Cota de consultas de CPF e controles de IA por assinante, e atualização crítica do sistema.</p>
          </div>
        </div>
      </div>

      {/* Atualização do sistema */}
      <div className={`${c.tableCard} p-5 space-y-4`}>
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><RotateCw className="w-4 h-4" /> Atualização do Sistema</h3>
        <p className="text-xs text-slate-500">
          Force uma versão já publicada em <b>todos</b> os terminais imediatamente. Quem estiver numa versão antiga vê o
          aviso vermelho e, após 2 min sem uso, uma tela bloqueante. Terminais já atualizados não são afetados.
        </p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-1.5">
          <div className="flex justify-between"><span className="text-slate-500">Versão no ar</span><span className="font-mono text-slate-900">{release?.buildId ?? "—"}</span></div>
          <div className="flex justify-between">
            <span className="text-slate-500">Atualização crítica</span>
            {release?.forceMatchesCurrent
              ? <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">ATIVA — forçando todos</span>
              : release?.forceActive
              ? <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">Ativa p/ versão anterior</span>
              : <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-bold text-[10px]">Inativa</span>}
          </div>
          {release?.updatedByName && release?.updatedAt && (
            <div className="text-slate-400 text-[11px]">Alterado por {release.updatedByName} em {new Date(release.updatedAt).toLocaleString("pt-BR")}</div>
          )}
        </div>
        <div>
          <label className={c.label}>Mensagem ao operador (opcional)</label>
          <textarea rows={2} maxLength={300} value={releaseMsg} onChange={(e) => setReleaseMsg(e.target.value)} disabled={!canEdit}
            className={c.field} placeholder="Ex.: Correção importante no fechamento de caixa. Atualize agora." />
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => releaseAction("force")} disabled={savingRelease} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 disabled:opacity-50">
              <ShieldAlert className="w-4 h-4" /> Forçar atualização crítica agora
            </button>
            <button onClick={() => releaseAction("clear")} disabled={savingRelease || !release?.forceActive} className={c.ghostBtn + " flex items-center gap-2 disabled:opacity-40"}>
              <X className="w-4 h-4" /> Cancelar obrigatoriedade
            </button>
          </div>
        )}
      </div>

      {/* Por assinante: CPF + IA */}
      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <IdCard className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Cota de CPF & controles de IA por assinante</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {tenants.map((t) => {
            const dr = drafts[t.id] || { cpfQuota: "", aiPrompt: "", aiOpPrompt: "", aiOverride: "" };
            return (
              <div key={t.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900">{t.tradeName || t.name}</span>
                    <span className="block text-[11px] text-slate-500">Plano {t.planName || "—"} · IA do plano: {t.planAiTokenQuota ?? "—"} tok/mês</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button onClick={() => patchTenant(t.id, { cpfQueryEnabled: !t.cpfQueryEnabled }, "Consulta de CPF atualizada.")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${t.cpfQueryEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                        CPF {t.cpfQueryEnabled ? "habilitado" : "desabilitado"}
                      </button>
                      <button onClick={() => patchTenant(t.id, { aiBlocked: !t.aiBlocked }, "Bloqueio de IA atualizado.")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${t.aiBlocked ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                        IA {t.aiBlocked ? "bloqueada" : "liberada"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className={c.label}>Cota CPF/mês <span className="text-slate-400 font-normal">(usadas: {t.cpfQueryUsed})</span></label>
                    <div className="flex gap-1.5">
                      <input type="number" min={0} value={dr.cpfQuota} disabled={!canEdit}
                        onChange={(e) => setDrafts((p) => ({ ...p, [t.id]: { ...dr, cpfQuota: e.target.value } }))} className={c.field} />
                      {canEdit && (
                        <button disabled={savingId === t.id} onClick={() => patchTenant(t.id, { cpfQueryQuotaMonthly: Number(dr.cpfQuota) }, "Cota de CPF salva.")}
                          className="px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs shrink-0">salvar</button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={c.label}>Override de cota IA (tok/mês)</label>
                    <div className="flex gap-1.5">
                      <input type="number" min={0} value={dr.aiOverride} disabled={!canEdit} placeholder={`plano: ${t.planAiTokenQuota ?? "—"}`}
                        onChange={(e) => setDrafts((p) => ({ ...p, [t.id]: { ...dr, aiOverride: e.target.value } }))} className={c.field} />
                    </div>
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className={c.label + " flex items-center gap-1.5"}><Cpu className="w-3.5 h-3.5 text-violet-500" /> Prompt de personalidade do <b>Agente de Atendimento</b> (WhatsApp do hóspede)</label>
                    <p className="text-[10px] text-slate-400">Base do sistema: responde dúvidas de hóspedes, consulta reservas/tarifas/serviços e escala para humano quando não sabe. O texto abaixo ajusta só o tom/estilo — nunca substitui as regras. O assinante não vê isto.</p>
                    <textarea rows={2} value={dr.aiPrompt} disabled={!canEdit}
                      onChange={(e) => setDrafts((p) => ({ ...p, [t.id]: { ...dr, aiPrompt: e.target.value } }))} className={c.field}
                      placeholder="Ex.: Trate os hóspedes de forma calorosa e regional, mencionando sempre o café da manhã caseiro." />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <label className={c.label + " flex items-center gap-1.5"}><Cpu className="w-3.5 h-3.5 text-amber-500" /> Prompt de personalidade do <b>Agente Operacional</b> (alertas para a equipe)</label>
                    <p className="text-[10px] text-slate-400">Base do sistema: detecta problemas operacionais (FNRH presa, quarto sujo há horas, reserva sem quarto…) e envia um resumo por WhatsApp à gerência. O texto abaixo ajusta só o tom das mensagens de alerta.</p>
                    <textarea rows={2} value={dr.aiOpPrompt} disabled={!canEdit}
                      onChange={(e) => setDrafts((p) => ({ ...p, [t.id]: { ...dr, aiOpPrompt: e.target.value } }))} className={c.field}
                      placeholder="Ex.: Seja bem objetivo e comece sempre com 'Bom dia, equipe do <hotel>'." />
                    {canEdit && (
                      <div className="flex justify-end">
                        <button disabled={savingId === t.id} onClick={() => patchTenant(t.id, {
                          aiSystemPromptExtra: dr.aiPrompt,
                          aiOperationalPromptExtra: dr.aiOpPrompt,
                          aiTokenQuotaOverride: dr.aiOverride.trim() === "" ? null : Number(dr.aiOverride),
                        }, "Configuração de IA do assinante salva.")}
                          className="mt-1 px-4 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold disabled:opacity-50">
                          {savingId === t.id ? "Salvando…" : "Salvar prompts + cota de IA"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AiModelSettings tenants={tenants} canEdit={canEdit} />
    </div>
  );
}
