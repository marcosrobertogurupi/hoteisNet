"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Check, Loader2, Copy } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../principal/cadastros/_ui";

const c = cadastroUI(false); // painel admin: tema claro fixo

const HOTEL_ROLE_OPTIONS = [
  { value: "TENANT_ADMIN", label: "Administrador (controle total)" },
  { value: "RECEPCIONIST", label: "Recepção" },
  { value: "GOVERNESS", label: "Governança" },
  { value: "FINANCIAL", label: "Financeiro" },
];
const roleLabel = (r: string) => HOTEL_ROLE_OPTIONS.find((o) => o.value === r)?.label || r;

interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  active: boolean;
  isAuthorizer: boolean;
}

const EMPTY = { name: "", email: "", phone: "", role: "RECEPCIONIST", password: "", isAuthorizer: false };

/** Janela de usuários do assinante: lista e cadastro (só PLATFORM_ADMIN / SUPER_ADMIN cadastram). */
export default function TenantUsersModal({
  tenant,
  canEdit,
  onClose,
  onChanged,
}: {
  tenant: { id: string; label: string };
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [f, setF] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/users?all=1`);
      const d = await res.json();
      if (d?.success) setUsers(d.users);
      else toast.error(d?.error || "Não foi possível carregar os usuários.");
    } catch {
      toast.error("Falha de rede ao carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, [tenant.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!f.name.trim() || !f.email.trim()) {
      toast.error("Informe nome e e-mail.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, password: f.password || undefined }),
      });
      const d = await res.json();
      if (!d?.success) {
        toast.error(d?.error || "Não foi possível criar o usuário.");
        return;
      }
      toast.success("Usuário criado.");
      setCreds(d.tempPassword ? { email: d.user.email, tempPassword: d.tempPassword } : null);
      setF(EMPTY);
      await load();
      onChanged();
    } catch {
      toast.error("Falha de rede ao criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={c.modalBackdrop}>
      <div className={`${c.modalCard} max-w-2xl max-h-[92vh] overflow-y-auto`}>
        <div className={`p-5 border-b flex items-center justify-between sticky top-0 bg-white ${c.modalDivider}`}>
          <div>
            <h2 className="text-lg font-bold">Usuários do assinante</h2>
            <p className="text-xs text-slate-500">{tenant.label}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {creds && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <Check className="w-4 h-4" /> Usuário criado com senha temporária
              </div>
              <p className="text-xs text-slate-600">Entregue ao usuário agora — a senha não é exibida novamente.</p>
              <div className="flex items-center gap-2 font-mono text-sm">
                <span className="text-slate-500">{creds.email}</span>
                <span className="px-2 py-1 rounded bg-white border border-emerald-200">{creds.tempPassword}</span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(creds.tempPassword);
                    toast.success("Senha copiada.");
                  }}
                  className="p-1.5 rounded-lg hover:bg-emerald-100"
                  title="Copiar senha"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-4 py-2.5">Nome</th>
                  <th className="px-4 py-2.5">Perfil</th>
                  <th className="px-4 py-2.5">Situação</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${c.tdivide}`}>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={`px-4 py-6 text-center ${c.empty}`}>
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold block ${c.strong}`}>{u.name}</span>
                        <span className="text-[11px] text-slate-500">{u.email}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {roleLabel(u.role)}
                        {u.isAuthorizer ? " · autorizador" : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        {u.active ? <span className="text-emerald-700 font-semibold">Ativo</span> : <span className="text-slate-400">Inativo</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {canEdit ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold">Novo usuário</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={c.input} placeholder="Nome completo" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <input className={c.input} placeholder="E-mail (login)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                <input className={c.input} placeholder="Telefone (opcional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                <select className={c.input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                  {HOTEL_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  className={`${c.input} sm:col-span-2`}
                  placeholder="Senha (deixe em branco para gerar uma temporária)"
                  type="text"
                  autoComplete="new-password"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={f.isAuthorizer} onChange={(e) => setF({ ...f, isAuthorizer: e.target.checked })} />
                Pode autorizar eventos críticos (desconto acima do limite, anulação no caixa…)
              </label>
              <div className="flex justify-end">
                <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar usuário
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Seu perfil só visualiza — o cadastro de usuários é feito por um administrador da plataforma.</p>
          )}
        </div>
      </div>
    </div>
  );
}
