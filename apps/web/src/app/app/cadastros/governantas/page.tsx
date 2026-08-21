"use client";

import { useState, useEffect, useCallback, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import {
  Sparkles,
  Plus,
  Search,
  Edit3,
  Trash2,
  ArrowLeft,
  Phone,
  X,
  Upload,
  Lock,
  Eye,
  EyeOff,
  User,
  Power,
  Send,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useConfirm } from "@/context/ConfirmContext";
import LoadingOverlay from "@/components/LoadingOverlay";

interface Housekeeper {
  id: string;
  name: string;
  whatsapp: string;
  photoUrl: string | null;
  active: boolean;
  createdAt: string;
}

const ACCEPTED_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export default function GovernantasPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const confirmDialog = useConfirm();

  const [housekeepers, setHousekeepers] = useState<Housekeeper[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Housekeeper | null>(null);

  const [formName, setFormName] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formPhoto, setFormPhoto] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadHousekeepers = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/housekeepers");
      const data = await res.json();
      if (data.success && Array.isArray(data.housekeepers)) {
        setHousekeepers(data.housekeepers);
      }
    } catch (err) {
      console.error("Erro ao carregar governantas:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHousekeepers();
  }, [loadHousekeepers]);

  const filtered = housekeepers.filter(
    (h) =>
      h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.whatsapp.includes(searchQuery)
  );

  const resetForm = () => {
    setFormName("");
    setFormWhatsapp("");
    setFormPhoto("");
    setFormPassword("");
    setFormActive(true);
    setShowPassword(false);
    setPhotoError(null);
    setFormError(null);
  };

  const handleOpenAdd = () => {
    setEditing(null);
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (h: Housekeeper) => {
    setEditing(h);
    setFormName(h.name);
    setFormWhatsapp(h.whatsapp);
    setFormPhoto(h.photoUrl || "");
    setFormPassword("");
    setFormActive(h.active);
    setShowPassword(false);
    setPhotoError(null);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError("Formato inválido. Envie uma imagem PNG, JPEG ou WEBP.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setPhotoError("Arquivo muito grande. O tamanho máximo é 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setFormPhoto(reader.result);
    };
    reader.onerror = () => setPhotoError("Não foi possível ler o arquivo selecionado.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formWhatsapp.trim()) {
      setFormError("Nome e WhatsApp são obrigatórios.");
      return;
    }
    if (!editing && !formPassword.trim()) {
      setFormError("Defina uma senha de acesso para a governanta.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        whatsapp: formWhatsapp.trim(),
        photoUrl: formPhoto || null,
        active: formActive,
      };
      if (formPassword.trim()) payload.password = formPassword.trim();

      const res = await fetch(
        editing ? `/api/tenant/housekeepers/${editing.id}` : "/api/tenant/housekeepers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.error || "Erro ao salvar governanta.");
        return;
      }

      setIsModalOpen(false);
      await loadHousekeepers();
    } catch (err: any) {
      setFormError(err.message || "Erro de rede ao salvar governanta.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: Housekeeper) => {
    const ok = await confirmDialog({
      title: "Excluir Governanta",
      message: `Tem certeza que deseja excluir "${h.name}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/tenant/housekeepers/${h.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Erro ao excluir governanta.");
        return;
      }
      await loadHousekeepers();
    } catch (err: any) {
      alert(err.message || "Erro de rede ao excluir governanta.");
    }
  };

  const handleToggleActive = async (h: Housekeeper) => {
    try {
      const res = await fetch(`/api/tenant/housekeepers/${h.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !h.active }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Erro ao atualizar status.");
        return;
      }
      await loadHousekeepers();
    } catch (err: any) {
      alert(err.message || "Erro de rede ao atualizar status.");
    }
  };

  const handleSendLink = async (h: Housekeeper) => {
    setSendingLinkId(h.id);
    setLinkFeedback(null);
    try {
      const res = await fetch(`/api/tenant/housekeepers/${h.id}/send-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLinkFeedback({ type: "error", text: data.error || "Erro ao enviar link por WhatsApp." });
        return;
      }
      setLinkFeedback({ type: "success", text: `Link do app enviado para ${h.name} via WhatsApp!` });
    } catch (err: any) {
      setLinkFeedback({ type: "error", text: err.message || "Erro de rede ao enviar link." });
    } finally {
      setSendingLinkId(null);
      setTimeout(() => setLinkFeedback(null), 5000);
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain} transition-colors`}>
      <LoadingOverlay show={isLoading} message="Buscando governantas..." submessage="Estamos carregando o cadastro de governança." />

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
            isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            Dados Sincronizados
          </span>
        </div>

        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-3xl border shadow-xl ${
          isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-200/50"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`p-3.5 border rounded-2xl ${
              isDark ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"
            }`}>
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Cadastro de Governantas
              </h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Equipe de limpeza com acesso ao aplicativo mobile de governança de quartos.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nova Governanta
          </button>
        </div>

        {linkFeedback && (
          <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            linkFeedback.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
              : "bg-red-500/15 border-red-500/40 text-red-400"
          }`}>
            <Send className="w-4 h-4 shrink-0" />
            <span>{linkFeedback.text}</span>
          </div>
        )}

        <div className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}>
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou WhatsApp..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs focus:outline-none transition ${
                isDark ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-rose-500" : "bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-rose-600"
              }`}
            />
          </div>

          <span className={`text-xs font-mono hidden md:inline-block ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Total governantas: <strong className={isDark ? "text-white" : "text-slate-900"}>{housekeepers.length}</strong>
          </span>
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
                  <th className="px-5 py-3.5">Governanta</th>
                  <th className="px-5 py-3.5">WhatsApp</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
                {filtered.map((h) => (
                  <tr key={h.id} className={`transition ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {h.photoUrl ? (
                          <img src={h.photoUrl} alt={h.name} className="w-9 h-9 rounded-full object-cover border border-slate-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-500 font-bold text-sm">
                            {h.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{h.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" /> {h.whatsapp}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleActive(h)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition ${
                          h.active
                            ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                            : "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30"
                        }`}
                      >
                        {h.active ? "ATIVA" : "INATIVA"}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSendLink(h)}
                          disabled={sendingLinkId === h.id}
                          title="Enviar link do app por WhatsApp"
                          className={`p-2 rounded-xl transition disabled:opacity-50 ${
                            isDark ? "bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white" : "bg-slate-100 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                          }`}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(h)}
                          title="Editar Governanta"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-rose-400 hover:bg-rose-600 hover:text-white" : "bg-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white"
                          }`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(h)}
                          title="Excluir Governanta"
                          className={`p-2 rounded-xl transition ${
                            isDark ? "bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white" : "bg-slate-100 text-red-600 hover:bg-red-600 hover:text-white"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-400 space-y-2">
                      <Sparkles className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Nenhuma governanta cadastrada</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className={`flex items-center justify-between p-5 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {editing ? "Editar Governanta" : "Nova Governanta"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                {formPhoto ? (
                  <img src={formPhoto} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-700" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500">
                    <User className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                  }`}>
                    <Upload className="w-3.5 h-3.5" />
                    Enviar foto
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} className="hidden" />
                  </label>
                  <p className={`text-[11px] mt-1 ${theme.textMuted}`}>PNG, JPEG ou WEBP (máx. 2MB)</p>
                  {photoError && <p className="text-[11px] text-red-500 font-medium">{photoError}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1.5">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome completo da governanta"
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 ${
                    isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1.5">WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={formWhatsapp}
                    onChange={(e) => setFormWhatsapp(e.target.value)}
                    placeholder="(63) 99999-9999"
                    className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 ${
                      isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
                <p className={`text-[11px] mt-1 ${theme.textMuted}`}>Usado como login no app de governança.</p>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1.5">
                  {editing ? "Nova senha (deixe em branco para manter a atual)" : "Senha de acesso"}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editing ? "••••••••" : "Defina uma senha"}
                    className={`w-full border rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-rose-500 ${
                      isDark ? "bg-slate-950 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <div className="flex items-center gap-2 text-sm">
                  <Power className="w-4 h-4 text-rose-500" />
                  Governanta ativa (permite login no app)
                </div>
              </label>

              {formError && <p className="text-[11px] text-red-500 font-medium">{formError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                    isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/20 transition disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
