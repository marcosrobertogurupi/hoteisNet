"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Loader2, Plus, X, Check, KeyRound, Copy, Plug, CheckCircle2, XCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Super Admin", PLATFORM_ADMIN: "Admin", PLATFORM_SUPPORT: "Suporte (só leitura)" };

interface Member { id: string; name: string; email: string; role: string; active: boolean; createdAt: string; }
interface Integration { key: string; name: string; configured: boolean; detail: string; env: string[]; }

export default function AdminTeamPage() {
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [canEdit, setCanEdit] = useState(false);
  const [myRole, setMyRole] = useState("");
  const [me, setMe] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "PLATFORM_SUPPORT" });
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, teamRes, intRes] = await Promise.all([
        fetch("/api/admin/auth/me").then((r) => r.json()),
        fetch("/api/admin/team").then((r) => r.json()),
        fetch("/api/admin/integrations").then((r) => r.json()),
      ]);
      if (meRes?.success) { setCanEdit(!!meRes.user.canEdit); setMyRole(meRes.user.role); setMfaEnabled(!!meRes.user.mfaEnabled); }
      if (teamRes?.success) { setMembers(teamRes.members); setMe(teamRes.me); }
      if (intRes?.success) setIntegrations(intRes.integrations);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await fetch("/api/admin/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((r) => r.json());
      if (!d?.success) { toast.error(d?.error || "Erro ao criar."); return; }
      setCreds({ email: d.email, tempPassword: d.tempPassword });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, data: Record<string, unknown>, ok: string) => {
    const d = await fetch(`/api/admin/team/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json());
    if (d?.success) {
      if (d.tempPassword) toast.success(`Nova senha temporária: ${d.tempPassword}`, { duration: 20000 } as any);
      else toast.success(ok);
      await load();
    } else toast.error(d?.error || "Erro.");
  };

  const mfaAction = async (action: "setup" | "enable" | "disable") => {
    setMfaBusy(true);
    try {
      const d = await fetch("/api/admin/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code: mfaCode }) }).then((r) => r.json());
      if (!d?.success) { toast.error(d?.error || "Erro."); return; }
      if (action === "setup") { setMfaSetup({ secret: d.secret, uri: d.uri }); setMfaCode(""); }
      else if (action === "enable") { toast.success("2FA ativado."); setMfaSetup(null); setMfaCode(""); setMfaEnabled(true); }
      else { toast.success("2FA desativado."); setMfaCode(""); setMfaEnabled(false); }
    } finally {
      setMfaBusy(false);
    }
  };

  const resetPw = async (m: Member) => {
    const okc = await confirmDialog({ title: "Resetar senha", message: `Gerar nova senha temporária para ${m.name}? A sessão atual dele cai.`, confirmLabel: "Resetar" });
    if (okc) patch(m.id, { resetPassword: true }, "Senha resetada.");
  };

  if (loading) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /> Carregando…</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sky-50 border border-sky-200 text-sky-600 rounded-2xl"><Users className="w-7 h-7" /></div>
          <div>
            <h1 className={c.title}>Equipe do painel</h1>
            <p className={c.subtitle}>Quem tem acesso ao back-office e o que cada papel pode fazer.</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setForm({ name: "", email: "", role: "PLATFORM_SUPPORT" }); setCreds(null); setModal(true); }}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo membro
          </button>
        )}
      </div>

      {/* 2FA da minha conta */}
      <div className={`${c.tableCard} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {mfaEnabled ? <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" /> : <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5" />}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Verificação em duas etapas (2FA) da sua conta</h3>
              <p className="text-xs text-slate-500">{mfaEnabled ? "Ativa — o login do painel pede um código do seu app autenticador." : "Recomendada. Protege o acesso ao back-office mesmo se a senha vazar."}</p>
            </div>
          </div>
          {!mfaEnabled && !mfaSetup && (
            <button onClick={() => mfaAction("setup")} disabled={mfaBusy} className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold disabled:opacity-50">Ativar 2FA</button>
          )}
        </div>

        {mfaSetup && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs text-slate-600">1. No seu app autenticador (Google Authenticator, Authy, 1Password…), adicione uma conta manualmente com esta chave:</p>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-bold bg-white border border-slate-200 rounded px-2 py-1 break-all">{mfaSetup.secret}</code>
              <button onClick={() => { navigator.clipboard?.writeText(mfaSetup.secret); toast.success("Chave copiada."); }} className="p-1.5 rounded hover:bg-slate-200"><Copy className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-[10px] text-slate-400 break-all">ou use o link: {mfaSetup.uri}</p>
            <p className="text-xs text-slate-600">2. Digite o código de 6 dígitos que o app mostrar:</p>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${c.field} !w-36 font-mono tracking-[0.3em] text-center`} placeholder="000000" />
              <button onClick={() => mfaAction("enable")} disabled={mfaBusy || mfaCode.length !== 6} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">Confirmar e ativar</button>
              <button onClick={() => { setMfaSetup(null); setMfaCode(""); }} className={c.ghostBtn}>Cancelar</button>
            </div>
          </div>
        )}

        {mfaEnabled && (
          <div className="mt-3 flex items-center gap-2">
            <input inputMode="numeric" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${c.field} !w-32 font-mono tracking-[0.3em] text-center`} placeholder="código" />
            <button onClick={() => mfaAction("disable")} disabled={mfaBusy || mfaCode.length !== 6} className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold disabled:opacity-50">Desativar 2FA</button>
          </div>
        )}
      </div>

      <div className={`${c.tableCard} overflow-hidden`}>
        <table className="w-full text-left text-xs">
          <thead className={c.thead}><tr><th className="px-5 py-3">Nome</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Papel</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ações</th></tr></thead>
          <tbody className={`divide-y ${c.tdivide}`}>
            {members.map((m) => {
              const canTouch = canEdit && (myRole === "SUPER_ADMIN" || m.role !== "SUPER_ADMIN");
              return (
                <tr key={m.id} className={!m.active ? "opacity-50" : ""}>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{m.name} {m.id === me && <span className="text-[10px] text-sky-600">(você)</span>}</td>
                  <td className="px-5 py-3.5 text-slate-600 font-mono">{m.email}</td>
                  <td className="px-5 py-3.5">
                    {canTouch && m.id !== me ? (
                      <select value={m.role} onChange={(e) => patch(m.id, { role: e.target.value }, "Papel atualizado.")} className={`${c.field} !py-1 !w-40 text-[11px]`}>
                        {Object.entries(ROLE_LABEL).filter(([k]) => k !== "SUPER_ADMIN" || myRole === "SUPER_ADMIN").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    ) : <span className="text-slate-700">{ROLE_LABEL[m.role] || m.role}</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {m.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canTouch && m.id !== me && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => resetPw(m)} title="Resetar senha" className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-amber-500 hover:text-white"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => patch(m.id, { active: !m.active }, m.active ? "Desativado." : "Reativado.")}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${m.active ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          {m.active ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200 flex items-center gap-2"><Plug className="w-4 h-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-900">Integrações & chaves de API</h3></div>
        <div className="divide-y divide-slate-200">
          {integrations.map((i) => (
            <div key={i.key} className="p-4 flex items-start gap-3">
              {i.configured ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{i.name} <span className={`ml-1 text-[10px] font-bold ${i.configured ? "text-emerald-600" : "text-rose-500"}`}>{i.configured ? "configurada" : "não configurada"}</span></div>
                <p className="text-[11px] text-slate-500">{i.detail}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">{i.env.join(" · ")}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-200">As chaves ficam nas variáveis de ambiente (Railway / Vercel) — o painel só mostra se estão presentes, nunca o valor.</p>
      </div>

      {modal && (
        <div className={c.modalBackdrop}>
          <div className={`${c.modalCard} max-w-md`}>
            <div className={`p-5 border-b flex items-center justify-between ${c.modalDivider}`}>
              <h2 className="text-lg font-bold">Novo membro da equipe</h2>
              <button onClick={() => setModal(false)} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            {creds ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-emerald-700"><Check className="w-5 h-5" /> <span className="font-semibold">Membro criado.</span></div>
                <p className="text-sm text-slate-600">Envie estas credenciais. A senha só aparece agora.</p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">E-mail</span><span className="font-mono">{creds.email}</span></div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Senha temporária</span>
                    <span className="flex items-center gap-2"><span className="font-mono font-bold">{creds.tempPassword}</span>
                      <button onClick={() => { navigator.clipboard?.writeText(creds.tempPassword); toast.success("Copiada."); }} className="p-1 rounded hover:bg-slate-200"><Copy className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                </div>
                <div className="flex justify-end"><button onClick={() => setModal(false)} className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold">Concluir</button></div>
              </div>
            ) : (
              <form onSubmit={create} className="p-6 space-y-3">
                <div className="space-y-1"><label className={c.label}>Nome</label><input className={c.field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-1"><label className={c.label}>E-mail</label><input className={c.field} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div className="space-y-1">
                  <label className={c.label}>Papel</label>
                  <select className={c.field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="PLATFORM_SUPPORT">Suporte (só leitura)</option>
                    <option value="PLATFORM_ADMIN">Admin (edita)</option>
                    {myRole === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super Admin</option>}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setModal(false)} className={c.ghostBtn}>Cancelar</button>
                  <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Criar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
