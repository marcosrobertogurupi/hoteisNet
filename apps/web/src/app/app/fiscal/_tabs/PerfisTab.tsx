"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit3, Trash2, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { inputCls, labelCls, cardCls, theadCls, rowCls, primaryBtn, ghostBtn, Modal } from "../_lib";

interface Perfil {
  id: string;
  name: string;
  ncm: string;
  cfop: string;
  cest: string | null;
  origem: string;
  cstIcms: string | null;
  aliqIcms: number | string;
  redBaseIcms: number | string;
  csosn: string | null;
  cstPis: string;
  aliqPis: number | string;
  cstCofins: string;
  aliqCofins: number | string;
  active: boolean;
  _count: { dishes: number; products: number };
}

const EMPTY = {
  id: "",
  nome: "",
  ncm: "",
  cfop: "5102",
  cest: "",
  origem: "0",
  cstIcms: "00",
  aliqIcms: "0",
  redBaseIcms: "0",
  csosn: "",
  cstPis: "07",
  aliqPis: "0",
  cstCofins: "07",
  aliqCofins: "0",
  ativo: true,
};

export default function PerfisTab() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const sync = useCallback(async () => {
    try {
      const res = await fetch("/api/pdv/perfis-fiscais");
      const data = await res.json();
      if (data?.success) setPerfis(data.perfis);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const openEdit = (p: Perfil) =>
    setForm({
      id: p.id,
      nome: p.name,
      ncm: p.ncm,
      cfop: p.cfop,
      cest: p.cest || "",
      origem: p.origem,
      cstIcms: p.cstIcms || "",
      aliqIcms: String(p.aliqIcms),
      redBaseIcms: String(p.redBaseIcms),
      csosn: p.csosn || "",
      cstPis: p.cstPis,
      aliqPis: String(p.aliqPis),
      cstCofins: p.cstCofins,
      aliqCofins: String(p.aliqCofins),
      ativo: p.active,
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/pdv/perfis-fiscais", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      toast.error(data.error || "Não foi possível salvar o perfil fiscal.");
      return;
    }
    toast.success(form.id ? "Perfil fiscal atualizado." : "Perfil fiscal criado.");
    setOpen(false);
    await sync();
  };

  const remove = async (p: Perfil) => {
    const ok = await confirmDialog({
      title: "Excluir perfil fiscal",
      message: `Excluir o perfil "${p.name}"?`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/pdv/perfis-fiscais?id=${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível excluir.");
    toast.success("Perfil fiscal excluído.");
    await sync();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Tributação reutilizável (NCM, CFOP, CST/CSOSN, alíquotas) aplicada a pratos e produtos. Preencha com o
          contador.
        </p>
        <button
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
          className={primaryBtn}
        >
          <Plus className="w-4 h-4" /> Novo perfil
        </button>
      </div>

      <div className={cardCls(isDark)}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={theadCls(isDark)}>
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">NCM</th>
                <th className="px-5 py-3">CFOP</th>
                <th className="px-5 py-3">ICMS</th>
                <th className="px-5 py-3">Em uso</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {perfis.map((p) => (
                <tr key={p.id} className={rowCls(isDark)}>
                  <td className="px-5 py-3.5">
                    <span className={`font-bold block ${isDark ? "text-white" : "text-slate-900"}`}>{p.name}</span>
                    {!p.active && <span className="text-[10px] text-amber-500">inativo</span>}
                  </td>
                  <td className="px-5 py-3.5 font-mono">{p.ncm}</td>
                  <td className="px-5 py-3.5 font-mono">{p.cfop}</td>
                  <td className="px-5 py-3.5 font-mono">
                    {p.cstIcms ? `CST ${p.cstIcms}` : p.csosn ? `CSOSN ${p.csosn}` : "—"} · {Number(p.aliqIcms).toFixed(2)}%
                  </td>
                  <td className="px-5 py-3.5">{p._count.dishes + p._count.products} item(ns)</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          openEdit(p);
                          setOpen(true);
                        }}
                        className={`p-2 rounded-xl transition ${
                          isDark ? "bg-slate-800 text-sky-400 hover:bg-sky-600 hover:text-white" : "bg-slate-100 text-sky-700 hover:bg-sky-600 hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(p)}
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
              {perfis.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className={`px-5 py-12 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nenhum perfil fiscal cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal isDark={isDark} title={form.id ? "Editar perfil fiscal" : "Novo perfil fiscal"} onClose={() => setOpen(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelCls(isDark)}>
                Nome do perfil <span className="text-rose-500">*</span>
              </label>
              <input
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="ex.: Bebida alcoólica 18% ICMS"
                className={inputCls(isDark)}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <F label="NCM *" v={form.ncm} on={(v) => setForm({ ...form, ncm: v })} isDark={isDark} mono />
              <F label="CFOP *" v={form.cfop} on={(v) => setForm({ ...form, cfop: v })} isDark={isDark} mono />
              <F label="CEST" v={form.cest} on={(v) => setForm({ ...form, cest: v })} isDark={isDark} mono />
              <div className="space-y-1.5">
                <label className={labelCls(isDark)}>Origem</label>
                <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className={inputCls(isDark)}>
                  {["0", "1", "2", "3", "4", "5", "6", "7", "8"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`text-[11px] font-mono uppercase ${isDark ? "text-slate-500" : "text-slate-400"}`}>ICMS</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <F label="CST ICMS" v={form.cstIcms} on={(v) => setForm({ ...form, cstIcms: v })} isDark={isDark} mono />
              <F label="Alíq. ICMS %" v={form.aliqIcms} on={(v) => setForm({ ...form, aliqIcms: v })} isDark={isDark} num />
              <F label="Red. base %" v={form.redBaseIcms} on={(v) => setForm({ ...form, redBaseIcms: v })} isDark={isDark} num />
              <F label="CSOSN (Simples)" v={form.csosn} on={(v) => setForm({ ...form, csosn: v })} isDark={isDark} mono />
            </div>

            <div className={`text-[11px] font-mono uppercase ${isDark ? "text-slate-500" : "text-slate-400"}`}>PIS / COFINS</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <F label="CST PIS" v={form.cstPis} on={(v) => setForm({ ...form, cstPis: v })} isDark={isDark} mono />
              <F label="Alíq. PIS %" v={form.aliqPis} on={(v) => setForm({ ...form, aliqPis: v })} isDark={isDark} num />
              <F label="CST COFINS" v={form.cstCofins} on={(v) => setForm({ ...form, cstCofins: v })} isDark={isDark} mono />
              <F label="Alíq. COFINS %" v={form.aliqCofins} on={(v) => setForm({ ...form, aliqCofins: v })} isDark={isDark} num />
            </div>

            <label className={`flex items-center gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Perfil ativo
            </label>

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
    </div>
  );
}

function F({
  label,
  v,
  on,
  isDark,
  mono,
  num,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  isDark: boolean;
  mono?: boolean;
  num?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls(isDark)}>{label}</label>
      <input
        type={num ? "number" : "text"}
        step={num ? "0.01" : undefined}
        min={num ? "0" : undefined}
        value={v}
        onChange={(e) => on(e.target.value)}
        className={`${inputCls(isDark)} ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
