"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit3, Trash2, Check, KeyRound, Copy, Monitor, Wifi, WifiOff } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { inputCls, labelCls, cardCls, theadCls, rowCls, primaryBtn, ghostBtn, Modal } from "../_lib";

interface Terminal {
  id: string;
  nome: string;
  serieNfce: number;
  serieNfe: number;
  ativo: boolean;
  impressoraModelo: string | null;
  impressoraPorta: string | null;
  ultimoHeartbeat: string | null;
  versaoAgente: string | null;
  statusSefaz: string | null;
  tokenConfigurado: boolean;
  tokenVersion: number;
}

const EMPTY = { id: "", nome: "", serieNfce: "1", serieNfe: "1", impressoraModelo: "", impressoraPorta: "", ativo: true };

export default function CaixasTab() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [terminais, setTerminais] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [tokenModal, setTokenModal] = useState<{ nome: string; token: string } | null>(null);

  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/pdv/terminais");
      const data = await res.json();
      if (data?.success) setTerminais(data.terminais);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/pdv/terminais", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível salvar o caixa.");
    setOpen(false);
    await sync();
    if (data.token) {
      setTokenModal({ nome: data.terminal?.nome || form.nome, token: data.token });
    } else {
      toast.success("Caixa atualizado.");
    }
  };

  const regenToken = async (t: Terminal) => {
    const ok = await confirmDialog({
      title: "Regenerar token do agente",
      message: `O agente fiscal do caixa "${t.nome}" vai parar de funcionar até ser reconfigurado com o novo token. Continuar?`,
      confirmLabel: "Regenerar",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/pdv/terminais/${t.id}/token`, { method: "POST" });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível regenerar o token.");
    await sync();
    setTokenModal({ nome: t.nome, token: data.token });
  };

  const remove = async (t: Terminal) => {
    const ok = await confirmDialog({
      title: "Excluir caixa",
      message: `Excluir o caixa "${t.nome}"?`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/pdv/terminais?id=${t.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível excluir.");
    toast.success("Caixa excluído.");
    await sync();
  };

  const online = (t: Terminal) =>
    t.ultimoHeartbeat && Date.now() - new Date(t.ultimoHeartbeat).getTime() < 5 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Cada caixa é um PC com o agente fiscal e uma impressora térmica. O token do agente é mostrado uma única vez.
        </p>
        <button
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
          className={primaryBtn}
        >
          <Plus className="w-4 h-4" /> Novo caixa
        </button>
      </div>

      <div className={cardCls(isDark)}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={theadCls(isDark)}>
              <tr>
                <th className="px-5 py-3">Caixa</th>
                <th className="px-5 py-3">Séries</th>
                <th className="px-5 py-3">Impressora</th>
                <th className="px-5 py-3">Agente</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {terminais.map((t) => (
                <tr key={t.id} className={rowCls(isDark)}>
                  <td className="px-5 py-3.5">
                    <span className={`font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                      <Monitor className="w-4 h-4 opacity-60" />
                      {t.nome}
                    </span>
                    {!t.ativo && <span className="text-[10px] text-amber-500">inativo</span>}
                  </td>
                  <td className="px-5 py-3.5 font-mono">
                    NFC-e {t.serieNfce} · NF-e {t.serieNfe}
                  </td>
                  <td className="px-5 py-3.5">
                    {t.impressoraModelo || "—"}
                    {t.impressoraPorta ? <span className="opacity-60"> ({t.impressoraPorta})</span> : null}
                  </td>
                  <td className="px-5 py-3.5">
                    {online(t) ? (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <Wifi className="w-3.5 h-3.5" /> online {t.versaoAgente ? `v${t.versaoAgente}` : ""}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        <WifiOff className="w-3.5 h-3.5" /> {t.tokenConfigurado ? "offline" : "sem token"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => regenToken(t)}
                        title="Regenerar token do agente"
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white" : "bg-slate-100 text-amber-600 hover:bg-amber-600 hover:text-white"
                        }`}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setForm({
                            id: t.id,
                            nome: t.nome,
                            serieNfce: String(t.serieNfce),
                            serieNfe: String(t.serieNfe),
                            impressoraModelo: t.impressoraModelo || "",
                            impressoraPorta: t.impressoraPorta || "",
                            ativo: t.ativo,
                          });
                          setOpen(true);
                        }}
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-sky-400 hover:bg-sky-600 hover:text-white" : "bg-slate-100 text-sky-700 hover:bg-sky-600 hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(t)}
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
              {terminais.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className={`px-5 py-12 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nenhum caixa cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal isDark={isDark} title={form.id ? "Editar caixa" : "Novo caixa"} onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelCls(isDark)}>
                Nome do caixa <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="ex.: Caixa Restaurante 1"
                className={inputCls(isDark)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls(isDark)}>Série NFC-e</label>
                <input
                  type="number"
                  min={1}
                  value={form.serieNfce}
                  onChange={(e) => setForm({ ...form, serieNfce: e.target.value })}
                  className={inputCls(isDark)}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls(isDark)}>Série NF-e</label>
                <input
                  type="number"
                  min={1}
                  value={form.serieNfe}
                  onChange={(e) => setForm({ ...form, serieNfe: e.target.value })}
                  className={inputCls(isDark)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls(isDark)}>Modelo da impressora</label>
                <input
                  value={form.impressoraModelo}
                  onChange={(e) => setForm({ ...form, impressoraModelo: e.target.value })}
                  placeholder="ex.: Epson TM-T20"
                  className={inputCls(isDark)}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls(isDark)}>Porta / caminho</label>
                <input
                  value={form.impressoraPorta}
                  onChange={(e) => setForm({ ...form, impressoraPorta: e.target.value })}
                  placeholder="ex.: USB ou COM1"
                  className={inputCls(isDark)}
                />
              </div>
            </div>
            {form.id && (
              <label className={`flex items-center gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                Caixa ativo
              </label>
            )}
            <div className={`pt-2 flex items-center justify-end gap-3 border-t ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <button type="button" onClick={() => setOpen(false)} className={ghostBtn(isDark)}>
                Cancelar
              </button>
              <button type="submit" className={primaryBtn}>
                <Check className="w-4 h-4" /> Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {tokenModal && (
        <Modal isDark={isDark} title="Token do agente fiscal" onClose={() => setTokenModal(null)}>
          <p className={`text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            Configure o agente do caixa <strong>{tokenModal.nome}</strong> com o token abaixo. Ele{" "}
            <strong>não será mostrado de novo</strong> — copie agora.
          </p>
          <div
            className={`font-mono text-xs break-all p-3 rounded-xl border ${
              isDark ? "bg-slate-950 border-slate-800 text-emerald-400" : "bg-slate-50 border-slate-200 text-emerald-700"
            }`}
          >
            {tokenModal.token}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(tokenModal.token);
                toast.success("Token copiado.");
              }}
              className={primaryBtn}
            >
              <Copy className="w-4 h-4" /> Copiar token
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
