"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Trash2, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { inputCls, labelCls, cardCls, theadCls, rowCls, primaryBtn, ghostBtn, Modal } from "../_lib";
import {
  CST_IBSCBS,
  CCREDPRES,
  CST_IS,
  CCLASSTRIB_IS,
  cClassTribOptions,
  redAliqFor,
} from "@/lib/fiscal/reformaTributaria";

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
  cstIbsCbs: string;
  cClassTrib: string;
  pRedAliqIbsCbs: number | string;
  cCredPres: string | null;
  pCredPres: number | string;
  isIncideIs: boolean;
  cstIs: string | null;
  cClassTribIs: string | null;
  pIs: number | string;
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
  cstIbsCbs: "000",
  cClassTrib: "000001",
  cClassTribOutro: "",
  pRedAliqIbsCbs: "0",
  cCredPres: "",
  pCredPres: "0",
  isIncideIs: false,
  cstIs: "",
  cClassTribIs: "",
  cClassTribIsOutro: "",
  pIs: "0",
  ativo: true,
};

type FormState = typeof EMPTY;

const TABS = [
  { id: "geral", label: "Geral" },
  { id: "atuais", label: "ICMS / PIS / COFINS" },
  { id: "ibscbs", label: "IBS / CBS" },
  { id: "is", label: "Imposto Seletivo" },
] as const;

// Um cClassTrib pode não estar na lista curada (o contador informa "Outro código").
const CCLASSTRIB_IS_CODES = new Set(CCLASSTRIB_IS.map((c) => c.code));

export default function PerfisTab() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("geral");
  const [form, setForm] = useState<FormState>(EMPTY);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

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

  const classTribChoices = useMemo(() => cClassTribOptions(form.cstIbsCbs), [form.cstIbsCbs]);
  const classTribIsKnown = form.cClassTribIs === "" || CCLASSTRIB_IS_CODES.has(form.cClassTribIs);

  const openNew = () => {
    setForm(EMPTY);
    setTab("geral");
    setOpen(true);
  };

  const openEdit = (p: Perfil) => {
    const known = cClassTribOptions(p.cstIbsCbs).some((c) => c.code === p.cClassTrib);
    const isKnown = !p.cClassTribIs || CCLASSTRIB_IS_CODES.has(p.cClassTribIs);
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
      cstIbsCbs: p.cstIbsCbs,
      cClassTrib: known ? p.cClassTrib : "__outro__",
      cClassTribOutro: known ? "" : p.cClassTrib,
      pRedAliqIbsCbs: String(p.pRedAliqIbsCbs),
      cCredPres: p.cCredPres || "",
      pCredPres: String(p.pCredPres),
      isIncideIs: p.isIncideIs,
      cstIs: p.cstIs || "",
      cClassTribIs: isKnown ? p.cClassTribIs || "" : "__outro__",
      cClassTribIsOutro: isKnown ? "" : p.cClassTribIs || "",
      pIs: String(p.pIs),
      ativo: p.active,
    });
    setTab("geral");
    setOpen(true);
  };

  // Ao trocar o CST, garante um cClassTrib compatível e puxa a redução sugerida.
  const changeCst = (cst: string) => {
    const opts = cClassTribOptions(cst);
    const next = opts[0]?.code || "__outro__";
    setForm((f) => ({
      ...f,
      cstIbsCbs: cst,
      cClassTrib: next,
      pRedAliqIbsCbs: next === "__outro__" ? f.pRedAliqIbsCbs : String(redAliqFor(next)),
    }));
  };

  const changeClassTrib = (code: string) => {
    setForm((f) => ({
      ...f,
      cClassTrib: code,
      pRedAliqIbsCbs: code === "__outro__" ? f.pRedAliqIbsCbs : String(redAliqFor(code)),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      cClassTrib: form.cClassTrib === "__outro__" ? form.cClassTribOutro : form.cClassTrib,
      cClassTribIs: form.cClassTribIs === "__outro__" ? form.cClassTribIsOutro : form.cClassTribIs,
    };
    const res = await fetch("/api/pdv/perfis-fiscais", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  const tabBtn = (id: (typeof TABS)[number]["id"], label: string) => {
    const activeCls = isDark ? "bg-sky-600 text-white" : "bg-sky-600 text-white";
    const idleCls = isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900";
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${tab === id ? activeCls : idleCls}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Classificação tributária reutilizável (NCM, CFOP, CST IBS/CBS, cClassTrib, Imposto Seletivo) aplicada a
          pratos e produtos. Preencha com o contador — as alíquotas de IBS/CBS são calculadas na emissão.
        </p>
        <button onClick={openNew} className={primaryBtn}>
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
                <th className="px-5 py-3">IBS / CBS</th>
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
                    CST {p.cstIbsCbs} · {p.cClassTrib}
                    {Number(p.pRedAliqIbsCbs) > 0 && (
                      <span className={isDark ? "text-slate-500" : "text-slate-400"}> · −{Number(p.pRedAliqIbsCbs)}%</span>
                    )}
                    {p.isIncideIs && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-bold">
                        IS
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">{p._count.dishes + p._count.products} item(ns)</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(p)}
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
            <div className={`flex flex-wrap items-center gap-1.5 p-1 rounded-2xl ${isDark ? "bg-slate-950" : "bg-slate-100"}`}>
              {TABS.map((t) => tabBtn(t.id, t.label))}
            </div>

            {/* ── Aba Geral ── */}
            {tab === "geral" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className={labelCls(isDark)}>
                    Nome do perfil <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={form.nome}
                    onChange={(e) => set("nome", e.target.value)}
                    placeholder="ex.: Refeição no restaurante (regime específico)"
                    className={inputCls(isDark)}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <F label="NCM *" v={form.ncm} on={(v) => set("ncm", v)} isDark={isDark} mono />
                  <F label="CFOP *" v={form.cfop} on={(v) => set("cfop", v)} isDark={isDark} mono />
                  <F label="CEST" v={form.cest} on={(v) => set("cest", v)} isDark={isDark} mono />
                  <div className="space-y-1.5">
                    <label className={labelCls(isDark)}>Origem</label>
                    <select value={form.origem} onChange={(e) => set("origem", e.target.value)} className={inputCls(isDark)}>
                      {["0", "1", "2", "3", "4", "5", "6", "7", "8"].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className={`flex items-center gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  <input type="checkbox" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} />
                  Perfil ativo
                </label>
              </div>
            )}

            {/* ── Aba ICMS / PIS / COFINS (tributos atuais — transição) ── */}
            {tab === "atuais" && (
              <div className="space-y-4">
                <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Tributos do modelo atual. Durante a transição da Reforma (2026–2032) seguem no
                  documento fiscal em paralelo ao IBS/CBS — mantenha preenchido conforme o contador.
                </p>
                <div className={`text-[11px] font-mono uppercase ${isDark ? "text-slate-500" : "text-slate-400"}`}>ICMS</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <F label="CST ICMS" v={form.cstIcms} on={(v) => set("cstIcms", v)} isDark={isDark} mono />
                  <F label="Alíq. ICMS %" v={form.aliqIcms} on={(v) => set("aliqIcms", v)} isDark={isDark} num />
                  <F label="Red. base %" v={form.redBaseIcms} on={(v) => set("redBaseIcms", v)} isDark={isDark} num />
                  <F label="CSOSN (Simples)" v={form.csosn} on={(v) => set("csosn", v)} isDark={isDark} mono />
                </div>
                <div className={`text-[11px] font-mono uppercase ${isDark ? "text-slate-500" : "text-slate-400"}`}>PIS / COFINS</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <F label="CST PIS" v={form.cstPis} on={(v) => set("cstPis", v)} isDark={isDark} mono />
                  <F label="Alíq. PIS %" v={form.aliqPis} on={(v) => set("aliqPis", v)} isDark={isDark} num />
                  <F label="CST COFINS" v={form.cstCofins} on={(v) => set("cstCofins", v)} isDark={isDark} mono />
                  <F label="Alíq. COFINS %" v={form.aliqCofins} on={(v) => set("aliqCofins", v)} isDark={isDark} num />
                </div>
              </div>
            )}

            {/* ── Aba IBS / CBS ── */}
            {tab === "ibscbs" && (
              <div className="space-y-4">
                <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Reforma Tributária do Consumo (LC 214/2025). Informe a <strong>classificação</strong> do item — o
                  sistema calcula as alíquotas de IBS (estadual/municipal) e CBS e a transição 2026–2033 na emissão.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className={labelCls(isDark)}>CST IBS/CBS *</label>
                    <select value={form.cstIbsCbs} onChange={(e) => changeCst(e.target.value)} className={inputCls(isDark)}>
                      {CST_IBSCBS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls(isDark)}>Classificação tributária (cClassTrib) *</label>
                    <select
                      value={form.cClassTrib}
                      onChange={(e) => changeClassTrib(e.target.value)}
                      className={inputCls(isDark)}
                    >
                      {classTribChoices.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                      <option value="__outro__">Outro código (informar)…</option>
                    </select>
                  </div>
                </div>
                {form.cClassTrib === "__outro__" && (
                  <F
                    label="cClassTrib (6 dígitos)"
                    v={form.cClassTribOutro}
                    on={(v) => set("cClassTribOutro", v)}
                    isDark={isDark}
                    mono
                  />
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <F
                    label="% redução de alíquota"
                    v={form.pRedAliqIbsCbs}
                    on={(v) => set("pRedAliqIbsCbs", v)}
                    isDark={isDark}
                    num
                  />
                  <div className="space-y-1.5">
                    <label className={labelCls(isDark)}>Crédito presumido</label>
                    <select value={form.cCredPres} onChange={(e) => set("cCredPres", e.target.value)} className={inputCls(isDark)}>
                      {CCREDPRES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {form.cCredPres && (
                    <F label="% crédito presumido" v={form.pCredPres} on={(v) => set("pCredPres", v)} isDark={isDark} num />
                  )}
                </div>
              </div>
            )}

            {/* ── Aba Imposto Seletivo ── */}
            {tab === "is" && (
              <div className="space-y-4">
                <label className={`flex items-center gap-2 text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <input
                    type="checkbox"
                    checked={form.isIncideIs}
                    onChange={(e) => set("isIncideIs", e.target.checked)}
                  />
                  Este item sofre incidência de Imposto Seletivo
                </label>
                <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  O IS incide sobre bebidas alcoólicas, bebidas açucaradas, cigarros e outros produtos definidos em lei
                  como prejudiciais à saúde ou ao meio ambiente. Confirme com o contador.
                </p>
                {form.isIncideIs && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className={labelCls(isDark)}>CST do IS</label>
                        <select value={form.cstIs} onChange={(e) => set("cstIs", e.target.value)} className={inputCls(isDark)}>
                          {CST_IS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls(isDark)}>Classificação tributária do IS</label>
                        <select
                          value={classTribIsKnown ? form.cClassTribIs : "__outro__"}
                          onChange={(e) => set("cClassTribIs", e.target.value)}
                          className={inputCls(isDark)}
                        >
                          {CCLASSTRIB_IS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                          <option value="__outro__">Outro código (informar)…</option>
                        </select>
                      </div>
                    </div>
                    {form.cClassTribIs === "__outro__" && (
                      <F
                        label="cClassTrib IS (6 dígitos)"
                        v={form.cClassTribIsOutro}
                        on={(v) => set("cClassTribIsOutro", v)}
                        isDark={isDark}
                        mono
                      />
                    )}
                    <F label="Alíquota do IS %" v={form.pIs} on={(v) => set("pIs", v)} isDark={isDark} num />
                  </>
                )}
              </div>
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
