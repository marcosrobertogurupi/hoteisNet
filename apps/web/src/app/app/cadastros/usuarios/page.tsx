"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ShieldCheck, Plus, Edit3, Power, ArrowLeft, X, Loader2, Search } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../_ui";

interface Usuario {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  tenantId?: string | null;
  tenant?: { id: string; name: string } | null;
}

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string | null;
  isAdmin: boolean;
}

const ALL_ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Super Administrador (plataforma)" },
  { value: "TENANT_ADMIN", label: "Administrador (controle total)" },
  { value: "RECEPCIONIST", label: "Recepção (padrão)" },
  { value: "GOVERNESS", label: "Governança (padrão)" },
  { value: "FINANCIAL", label: "Financeiro (padrão)" },
];

const ADMIN_ROLES = ["SUPER_ADMIN", "TENANT_ADMIN"];

function roleLabel(role: string) {
  return ALL_ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

export default function UsuariosPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const ui = cadastroUI(isDark);
  const uField = `w-full rounded-lg p-2.5 text-sm outline-none ${
    isDark ? "bg-slate-950 border border-slate-800 text-white focus:border-indigo-500" : "bg-white border border-slate-300 text-slate-900 focus:border-indigo-500"
  }`;
  const toast = useToast();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "RECEPCIONIST", tenantId: "" });
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const roleOptions = useMemo(
    () => (isSuperAdmin ? ALL_ROLE_OPTIONS : ALL_ROLE_OPTIONS.filter((r) => r.value !== "SUPER_ADMIN")),
    [isSuperAdmin]
  );

  const tenants = useMemo(() => {
    const map = new Map<string, string>();
    usuarios.forEach((u) => {
      if (u.tenant) map.set(u.tenant.id, u.tenant.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [usuarios]);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) setMe(data.user);
    } catch {
      // silencioso — a tela ainda funciona sem esse dado extra
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (data.success) setUsuarios(data.users);
      else toast.error(data.error || "Não foi possível carregar os usuários.");
    } catch {
      toast.error("Erro de conexão ao carregar usuários.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMe();
    loadUsers();
  }, [loadMe, loadUsers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (term && !u.name.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term)) return false;
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter === "ATIVO" && !u.active) return false;
      if (statusFilter === "INATIVO" && u.active) return false;
      return true;
    });
  }, [usuarios, search, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", role: "RECEPCIONIST", tenantId: me?.tenantId || "" });
    setShowModal(true);
  };

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, tenantId: u.tenantId || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || (!editing && !form.email.trim())) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    if (!editing && form.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const res = editing
        ? await fetch("/api/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editing.id,
              name: form.name,
              role: form.role,
              ...(form.password ? { password: form.password } : {}),
            }),
          })
        : await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...form,
              ...(isSuperAdmin && form.tenantId ? { tenantId: form.tenantId } : {}),
            }),
          });

      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível salvar o usuário.");
        setSaving(false);
        return;
      }

      toast.success(editing ? "Usuário atualizado com sucesso." : "Usuário criado com sucesso.");
      setShowModal(false);
      loadUsers();
    } catch {
      toast.error("Erro de conexão ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: Usuario) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, active: !u.active }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível alterar o status do usuário.");
        return;
      }
      toast.success(`Usuário ${u.active ? "desativado" : "reativado"} com sucesso.`);
      loadUsers();
    } catch {
      toast.error("Erro de conexão ao alterar status do usuário.");
    }
  };

  return (
    <div className={ui.page(theme.bgApp, theme.textMain)}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/app/cadastros" className={ui.backLink}>
            <ArrowLeft className="w-4 h-4" /> Voltar para a Central de Cadastros
          </Link>
        </div>

        <div className={ui.headerCard}>
          <div className="flex items-center gap-4">
            <div
              className={`p-3.5 border rounded-2xl ${
                isDark ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-indigo-50 border-indigo-200 text-indigo-600"
              }`}
            >
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className={ui.title}>Usuários &amp; Permissões de Acesso</h1>
              <p className={ui.subtitle}>
                {isSuperAdmin
                  ? "Contas de login, papéis de acesso e auditoria — de todos os hotéis."
                  : "Contas de login (e-mail/senha), papéis de acesso e auditoria."}
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        </div>

        <div className={`flex flex-col md:flex-row gap-3 ${ui.toolbar}`}>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className={`${ui.input} pl-9 pr-3 py-2.5`}
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`${ui.input} px-3 py-2.5`}>
            <option value="ALL">Todos os papéis</option>
            {ALL_ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${ui.input} px-3 py-2.5`}>
            <option value="ALL">Todos os status</option>
            <option value="ATIVO">Somente ativos</option>
            <option value="INATIVO">Somente inativos</option>
          </select>
        </div>

        <div className={`${ui.tableCard} overflow-x-auto`}>
          <table className="w-full text-left text-xs">
            <thead className={ui.thead}>
              <tr>
                <th className="px-5 py-3.5">Nome</th>
                <th className="px-5 py-3.5">E-mail</th>
                {isSuperAdmin && <th className="px-5 py-3.5">Hotel</th>}
                <th className="px-5 py-3.5">Papel de Acesso</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${ui.tdivide}`}>
              {loading && (
                <tr><td colSpan={isSuperAdmin ? 6 : 5} className={`px-5 py-8 text-center ${ui.empty}`}>Carregando...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={isSuperAdmin ? 6 : 5} className={`px-5 py-8 text-center ${ui.empty}`}>Nenhum usuário encontrado.</td></tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className={`transition ${ui.rowHover}`}>
                  <td className={`px-5 py-4 font-bold text-sm ${ui.strong}`}>
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-[10px] font-mono text-indigo-600 dark:text-indigo-400">(você)</span>}
                  </td>
                  <td className={`px-5 py-4 font-mono ${ui.muted}`}>{u.email}</td>
                  {isSuperAdmin && <td className={`px-5 py-4 ${ui.muted}`}>{u.tenant?.name || "—"}</td>}
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold ${
                        ADMIN_ROLES.includes(u.role)
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                          : isDark
                            ? "bg-slate-800 text-indigo-300"
                            : "bg-slate-100 text-indigo-700"
                      }`}
                    >
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold ${
                        u.active ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                      }`}
                    >
                      {u.active ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        title="Editar"
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white" : "bg-slate-100 text-indigo-700 hover:bg-indigo-600 hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={u.id === me?.id && u.active}
                        title={u.id === me?.id && u.active ? "Você não pode desativar a própria conta" : u.active ? "Desativar" : "Reativar"}
                        className={`p-2 rounded-xl transition disabled:opacity-30 disabled:cursor-not-allowed ${
                          isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                        }`}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className={ui.modalBackdrop}>
          <div className={`${ui.modalCard} max-w-md p-6 space-y-4`}>
            <div className={`flex items-center justify-between pb-3 border-b ${ui.modalDivider}`}>
              <h3 className="font-bold text-base">{editing ? "Editar Usuário" : "Novo Usuário"}</h3>
              <button onClick={() => setShowModal(false)} className="opacity-70 hover:opacity-100 transition-opacity">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 ${ui.label}`}>Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={uField}
                />
              </div>

              <div>
                <label className={`block mb-1 ${ui.label}`}>E-mail {editing && "(não pode ser alterado)"}</label>
                <input
                  type="email"
                  value={form.email}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={`${uField} disabled:opacity-50`}
                />
              </div>

              <div>
                <label className={`block mb-1 ${ui.label}`}>
                  {editing ? "Nova Senha (deixe em branco para manter)" : "Senha"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"}
                  className={uField}
                />
              </div>

              <div>
                <label className={`block mb-1 ${ui.label}`}>Papel de Acesso</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className={uField}
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className={`text-[10px] mt-1 ${ui.empty}`}>
                  Administrador tem controle total. Os demais papéis só incluem/alteram — nunca excluem — e não acessam Configurações, Usuários ou Módulo Fiscal.
                </p>
              </div>

              {isSuperAdmin && !editing && (
                <div>
                  <label className={`block mb-1 ${ui.label}`}>Hotel de destino</label>
                  <select
                    value={form.tenantId}
                    onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                    className={uField}
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <p className={`text-[10px] mt-1 ${ui.empty}`}>Como Super Administrador, você pode criar este usuário em qualquer hotel.</p>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? "Salvar Alterações" : "Criar Usuário"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
