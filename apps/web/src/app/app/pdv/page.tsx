"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Store, Plus, RefreshCw, Search, Trash2, Minus, Settings2, Banknote, ArrowRightLeft, XCircle, Receipt,
  MessageSquare, Printer, RotateCcw, BarChart3, Wallet,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { money, cardCls, inputCls, primaryBtn, successBtn, ghostBtn, StatusPill, FORMA_LABEL, type Atendimento } from "./_ui";
import AbrirComandaModal from "./_components/AbrirComandaModal";
import PagamentoModal from "./_components/PagamentoModal";
import TransferirModal from "./_components/TransferirModal";
import PendentesEmissaoModal from "./_components/PendentesEmissaoModal";
import TurnoModal from "./_components/TurnoModal";
import CaixaMovimentoModal from "./_components/CaixaMovimentoModal";

interface Terminal {
  id: string;
  nome: string;
}
interface CatItem {
  tipo: "PRATO" | "PRODUTO";
  id: string;
  nome: string;
  categoria: string | null;
  preco: number;
  codigoBarras: string | null;
  temPerfilFiscal: boolean;
}

const TERMINAL_KEY = "pdv_terminal_id";

export default function PdvPage() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();
  const confirmDialog = useConfirm();

  const [terminais, setTerminais] = useState<Terminal[]>([]);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [catalogo, setCatalogo] = useState<CatItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [itemQuery, setItemQuery] = useState("");
  const [modal, setModal] = useState<null | "abrir" | "parcial" | "fechar" | "transferir" | "pendentes" | "turno" | "caixa">(null);
  const [categoria, setCategoria] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TERMINAL_KEY);
      if (saved) setTerminalId(saved);
    } catch {}
    fetch("/api/pdv/terminais")
      .then((r) => r.json())
      .then((d) => d?.success && setTerminais(d.terminais.filter((t: any) => t.ativo).map((t: any) => ({ id: t.id, nome: t.nome }))));
    fetch("/api/pdv/catalogo-venda")
      .then((r) => r.json())
      .then((d) => d?.success && setCatalogo(d.itens));
  }, []);

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pdv/atendimentos");
      const data = await res.json();
      if (data?.success) setAtendimentos(data.atendimentos);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (terminalId) sync();
  }, [terminalId, sync]);

  const pickTerminal = (id: string) => {
    try {
      localStorage.setItem(TERMINAL_KEY, id);
    } catch {}
    setTerminalId(id);
  };

  const abertas = useMemo(
    () => atendimentos.filter((a) => ["ABERTA", "AGUARDANDO_FISCAL", "FISCAL_REJEITADA"].includes(a.status)),
    [atendimentos]
  );
  const doDia = useMemo(
    () => atendimentos.filter((a) => ["FISCAL_AUTORIZADA", "CANCELADA"].includes(a.status)),
    [atendimentos]
  );
  const selected = atendimentos.find((a) => a.id === selectedId) || null;

  const turno = useMemo(() => {
    const fechadas = atendimentos.filter((a) => a.fechadaEm && a.status !== "CANCELADA");
    return { qtd: fechadas.length, total: fechadas.reduce((s, a) => s + a.total, 0) };
  }, [atendimentos]);

  const upsert = (a: Atendimento) => {
    setAtendimentos((prev) => {
      const i = prev.findIndex((x) => x.id === a.id);
      return i >= 0 ? prev.map((x) => (x.id === a.id ? a : x)) : [a, ...prev];
    });
    setSelectedId(a.id);
  };

  const addItem = async (ref: { dishId?: string; productId?: string; codigoBarras?: string }) => {
    if (!selected) return;
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ref, quantidade: 1 }),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível adicionar o item.");
    upsert(data.atendimento);
    setItemQuery("");
  };

  const changeQty = async (itemId: string, delta: number, atual: number) => {
    if (!selected) return;
    const nova = atual + delta;
    if (nova <= 0) return cancelItem(itemId);
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}/itens`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, quantidade: nova }),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Erro ao alterar a quantidade.");
    upsert(data.atendimento);
  };

  const cancelItem = async (itemId: string) => {
    if (!selected) return;
    const motivo = window.prompt("Motivo do cancelamento do item (opcional):", "") ?? "";
    const res = await fetch(
      `/api/pdv/atendimentos/${selected.id}/itens?itemId=${itemId}&motivo=${encodeURIComponent(motivo)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Erro ao cancelar o item.");
    upsert(data.atendimento);
  };

  const setItemNote = async (itemId: string, atual: string | null) => {
    if (!selected) return;
    const obs = window.prompt("Observação para a cozinha/bar:", atual ?? "");
    if (obs === null) return;
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}/itens`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, observacao: obs }),
    });
    const data = await res.json();
    if (data.success) upsert(data.atendimento);
  };

  const reabrir = async () => {
    if (!selected) return;
    const adminEmail = window.prompt("Reabrir a comanda exige autorização.\nE-mail do administrador:");
    if (!adminEmail) return;
    const adminPassword = window.prompt("Senha do administrador:");
    if (!adminPassword) return;
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}/reabrir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail, adminPassword }),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível reabrir.");
    toast.success("Comanda reaberta.");
    upsert(data.atendimento);
  };

  const cancelar = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: "Cancelar comanda",
      message: `Cancelar a comanda ${selected.comanda.number}? Os itens serão descartados.`,
      confirmLabel: "Cancelar comanda",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível cancelar.");
    toast.success("Comanda cancelada.");
    upsert(data.atendimento);
  };

  const setDesconto = async (valor: number, admin?: { adminEmail: string; adminPassword: string }) => {
    if (!selected) return;
    const res = await fetch(`/api/pdv/atendimentos/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desconto: valor, ...admin }),
    });
    const data = await res.json();
    if (data.success) {
      upsert(data.atendimento);
      return;
    }
    if (data.precisaAutorizacao && !admin) {
      const adminEmail = window.prompt(
        `Desconto acima de ${data.limitePercent ?? ""}% exige autorização.\nE-mail do administrador:`
      );
      if (!adminEmail) return;
      const adminPassword = window.prompt("Senha do administrador:");
      if (!adminPassword) return;
      return setDesconto(valor, { adminEmail, adminPassword });
    }
    toast.error(data.error || "Não foi possível aplicar o desconto.");
  };

  const [emitindo, setEmitindo] = useState<string | null>(null);

  const refetchOne = async (atendimentoId: string) => {
    const res = await fetch(`/api/pdv/atendimentos/${atendimentoId}`);
    const data = await res.json();
    if (data?.success) upsert(data.atendimento);
    return data?.atendimento?.status as string | undefined;
  };

  const emitir = async (atendimentoId: string) => {
    setEmitindo(atendimentoId);
    try {
      const res = await fetch(`/api/pdv/atendimentos/${atendimentoId}/emitir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível enviar para emissão.");
        return;
      }
      toast.info("Comanda na fila de emissão. Aguardando o agente do caixa…");
      // Poll curto e limitado (não é polling de fundo): confere o status por ~40s.
      for (let i = 0; i < 13; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await refetchOne(atendimentoId);
        if (st === "FISCAL_AUTORIZADA") {
          toast.success("Cupom autorizado!");
          break;
        }
        if (st === "FISCAL_REJEITADA") {
          toast.error("Cupom rejeitado pela SEFAZ — veja o motivo na comanda.");
          break;
        }
      }
    } finally {
      setEmitindo(null);
    }
  };

  const verDanfe = async (docId: string) => {
    const res = await fetch(`/api/pdv/documentos/${docId}`);
    const data = await res.json();
    if (data?.success && data.documento?.danfeUrl) window.open(data.documento.danfeUrl, "_blank");
    else toast.info(data?.documento?.status === "AUTORIZADA" ? "DANFE ainda não disponível." : "Documento não autorizado.");
  };

  const categorias = useMemo(
    () => Array.from(new Set(catalogo.map((i) => i.categoria).filter(Boolean) as string[])).sort(),
    [catalogo]
  );

  const catFiltered = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q && !categoria) return [];
    return catalogo
      .filter((i) => (!categoria || i.categoria === categoria))
      .filter((i) => !q || i.nome.toLowerCase().includes(q) || (i.codigoBarras || "").includes(q))
      .slice(0, categoria && !q ? 30 : 8);
  }, [itemQuery, categoria, catalogo]);

  // ---- Seleção de caixa ----
  if (!terminalId) {
    return (
      <div className={`min-h-screen p-4 md:p-8 ${theme.bgApp} ${theme.textMain}`}>
        <div className="max-w-md mx-auto mt-16 space-y-4">
          <div className={`${cardCls(isDark)} p-6 text-center space-y-4`}>
            <Store className="w-10 h-10 mx-auto text-sky-500" />
            <h1 className="text-lg font-bold">Qual caixa é este?</h1>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              A escolha fica salva neste navegador. Troque depois no topo da tela.
            </p>
            <div className="space-y-2">
              {terminais.map((t) => (
                <button key={t.id} onClick={() => pickTerminal(t.id)} className={`${primaryBtn} w-full`}>
                  {t.nome}
                </button>
              ))}
              {terminais.length === 0 && (
                <p className="text-xs text-amber-500">
                  Nenhum caixa cadastrado.{" "}
                  <Link href="/app/fiscal" className="underline">
                    Cadastre em Fiscal &amp; PDV
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const terminalNome = terminais.find((t) => t.id === terminalId)?.nome || "Caixa";

  return (
    <div className={`min-h-screen p-4 md:p-6 ${theme.bgApp} ${theme.textMain}`}>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-50 text-sky-600"}`}>
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">PDV do Restaurante</h1>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {terminalNome} ·{" "}
                <button onClick={() => setTerminalId(null)} className="underline">
                  trocar caixa
                </button>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setModal("turno")} className={ghostBtn(isDark)}>
              <BarChart3 className="w-4 h-4" /> Turno · {turno.qtd} · {money(turno.total)}
            </button>
            <button onClick={() => setModal("caixa")} className={ghostBtn(isDark)}>
              <Wallet className="w-4 h-4" /> Caixa
            </button>
            <button onClick={() => setModal("pendentes")} className={ghostBtn(isDark)}>
              <Receipt className="w-4 h-4" /> Pendentes
            </button>
            <button onClick={sync} className={ghostBtn(isDark)}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link href="/app/fiscal" className={ghostBtn(isDark)} title="Configuração fiscal & PDV">
              <Settings2 className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          {/* Lista de comandas */}
          <div className="space-y-3">
            <button onClick={() => setModal("abrir")} className={`${primaryBtn} w-full`}>
              <Plus className="w-4 h-4" /> Abrir comanda
            </button>
            <div className={`${cardCls(isDark)} divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"} overflow-hidden`}>
              {abertas.length === 0 && (
                <p className={`p-4 text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>Nenhuma comanda aberta.</p>
              )}
              {abertas.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left p-3 transition ${
                    a.id === selectedId ? (isDark ? "bg-slate-800" : "bg-sky-50") : isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">Comanda {a.comanda.number}</span>
                    <StatusPill status={a.status} />
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {a.tipoCliente === "HOSPEDE"
                      ? `Quarto ${a.hospedagem?.quarto ?? "—"} · ${a.hospedagem?.hospede ?? ""}`
                      : a.nomeCliente || "Passante"}
                    {a.mesa ? ` · Mesa ${a.mesa.numero}` : ""}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs font-mono">
                    <span>{money(a.total)}</span>
                    {a.saldo !== a.total && <span className="text-sky-500">saldo {money(a.saldo)}</span>}
                  </div>
                </button>
              ))}
            </div>
            {doDia.length > 0 && (
              <details className={`${cardCls(isDark)} p-3 text-xs`}>
                <summary className={`cursor-pointer font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Encerradas hoje ({doDia.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {doDia.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="w-full flex items-center justify-between py-1"
                    >
                      <span>Comanda {a.comanda.number}</span>
                      <StatusPill status={a.status} />
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Detalhe */}
          <div className={`${cardCls(isDark)} p-4`}>
            {!selected ? (
              <div className={`h-full min-h-[300px] grid place-items-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Selecione ou abra uma comanda.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">Comanda {selected.comanda.number}</h2>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {selected.pontoVenda?.nome ? `${selected.pontoVenda.nome} · ` : ""}
                      {selected.tipoCliente === "HOSPEDE"
                        ? `Quarto ${selected.hospedagem?.quarto} · ${selected.hospedagem?.hospede}`
                        : selected.nomeCliente || "Passante"}
                      {selected.mesa ? ` · Mesa ${selected.mesa.numero}` : ""}
                    </p>
                  </div>
                  <StatusPill status={selected.status} />
                </div>

                {selected.status === "ABERTA" && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        value={itemQuery}
                        onChange={(e) => setItemQuery(e.target.value)}
                        placeholder="Buscar prato ou produto / bipar código de barras…"
                        className={`${inputCls(isDark)} pl-9`}
                      />
                    </div>
                    {categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setCategoria(null)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                            !categoria ? "bg-sky-600 text-white border-sky-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
                          }`}
                        >
                          Buscar
                        </button>
                        {categorias.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setCategoria(categoria === cat ? null : cat)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                              categoria === cat ? "bg-sky-600 text-white border-sky-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                    {catFiltered.length > 0 && (
                      <div
                        className={`rounded-xl border overflow-hidden ${
                          categoria && !itemQuery ? "max-h-64 overflow-y-auto" : ""
                        } ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
                      >
                        {catFiltered.map((c) => (
                          <button
                            key={`${c.tipo}-${c.id}`}
                            onClick={() => addItem(c.tipo === "PRATO" ? { dishId: c.id } : { productId: c.id })}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs transition border-b last:border-b-0 ${
                              isDark ? "hover:bg-slate-800 border-slate-800" : "hover:bg-slate-50 border-slate-100"
                            }`}
                          >
                            <span>
                              {c.nome}
                              {!c.temPerfilFiscal && (
                                <span className="text-amber-500" title="Vende normal; só não sai cupom fiscal até configurar a tributação"> · sem perfil fiscal</span>
                              )}
                            </span>
                            <span className="font-mono">{money(c.preco)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Itens */}
                <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                  <table className="w-full text-xs">
                    <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-200"}`}>
                      {selected.itens.map((it) => (
                        <tr key={it.id} className={it.cancelado ? "opacity-45" : ""}>
                          <td className="px-3 py-2">
                            <span className={it.cancelado ? "line-through" : ""}>{it.nome}</span>
                            {it.observacao && <div className="text-[10px] text-sky-500">» {it.observacao}</div>}
                            {it.cancelado && (
                              <div className="text-[10px] text-rose-500">
                                cancelado{it.motivoCancelamento ? `: ${it.motivoCancelamento}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 w-28">
                            {selected.status === "ABERTA" && !it.cancelado ? (
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => changeQty(it.id, -1, it.quantidade)} className="p-1 rounded bg-slate-500/15">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-mono w-5 text-center">{it.quantidade}</span>
                                <button onClick={() => changeQty(it.id, 1, it.quantidade)} className="p-1 rounded bg-slate-500/15">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <span className="font-mono">{it.quantidade}×</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${it.cancelado ? "line-through" : ""}`}>{money(it.total)}</td>
                          {selected.status === "ABERTA" && (
                            <td className="px-2 py-2 w-14">
                              {!it.cancelado && (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setItemNote(it.id, it.observacao)} className="p-1 text-slate-400" title="Observação">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => cancelItem(it.id)} className="p-1 text-rose-500" title="Cancelar item">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                      {selected.itens.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`px-3 py-6 text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            Sem itens.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totais */}
                <div className={`rounded-xl p-3 text-xs space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
                  <Row label="Subtotal" value={money(selected.subtotal)} isDark={isDark} />
                  <div className="flex justify-between items-center">
                    <span className={isDark ? "text-slate-400" : "text-slate-500"}>Desconto</span>
                    {selected.status === "ABERTA" ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={selected.desconto}
                        onBlur={(e) => setDesconto(Number(e.target.value) || 0)}
                        className={`${inputCls(isDark)} w-24 py-1 text-right font-mono`}
                      />
                    ) : (
                      <span className="font-mono">− {money(selected.desconto)}</span>
                    )}
                  </div>
                  <div className={`flex justify-between pt-1 border-t font-bold ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                    <span>Total</span>
                    <span className="font-mono">{money(selected.total)}</span>
                  </div>
                  {selected.pago > 0 && (
                    <>
                      <Row label="Pago" value={`− ${money(selected.pago)}`} isDark={isDark} />
                      <div className="flex justify-between font-bold text-sky-500">
                        <span>Saldo</span>
                        <span className="font-mono">{money(selected.saldo)}</span>
                      </div>
                    </>
                  )}
                </div>

                {selected.pagamentos.length > 0 && (
                  <div className="text-[11px] space-y-0.5">
                    {selected.pagamentos.map((p) => (
                      <div key={p.id} className={`flex justify-between ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        <span>
                          {p.tipo === "ADVANCE" ? "Parcial" : "Acerto"} · {FORMA_LABEL[p.forma] || p.forma}
                          {p.troco > 0 ? ` (troco ${money(p.troco)})` : ""}
                        </span>
                        <span className="font-mono">{money(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {selected.status === "FISCAL_REJEITADA" && selected.documentosFiscais[0]?.motivoRejeicao && (
                  <p className="text-xs text-rose-500">Cupom rejeitado: {selected.documentosFiscais[0].motivoRejeicao}</p>
                )}

                {selected.status === "FISCAL_AUTORIZADA" && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-emerald-500 font-semibold">
                      NFC-e {selected.documentosFiscais[0]?.serie}/{selected.documentosFiscais[0]?.numero} autorizada
                    </span>
                    {selected.documentosFiscais[0] && (
                      <button onClick={() => verDanfe(selected.documentosFiscais[0].id)} className={ghostBtn(isDark)}>
                        <Receipt className="w-4 h-4" /> Ver DANFE
                      </button>
                    )}
                  </div>
                )}

                {/* Ações */}
                {selected.itens.some((i) => !i.cancelado) && (
                  <a
                    href={`/app/pdv/conferencia/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${ghostBtn(isDark)} w-full`}
                  >
                    <Printer className="w-4 h-4" /> Imprimir conferência (pré-conta)
                  </a>
                )}
                {selected.status === "ABERTA" && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      onClick={() => setModal("parcial")}
                      disabled={selected.saldo <= 0 || !selected.itens.some((i) => !i.cancelado)}
                      className={primaryBtn}
                    >
                      <Banknote className="w-4 h-4" /> Parcial
                    </button>
                    <button
                      onClick={() => setModal("transferir")}
                      disabled={!selected.itens.some((i) => !i.cancelado)}
                      className={ghostBtn(isDark)}
                    >
                      <ArrowRightLeft className="w-4 h-4" /> Transferir
                    </button>
                    <button onClick={cancelar} className={ghostBtn(isDark)}>
                      <XCircle className="w-4 h-4" /> Cancelar
                    </button>
                    <button
                      onClick={() => setModal("fechar")}
                      disabled={!selected.itens.some((i) => !i.cancelado)}
                      className={successBtn}
                    >
                      <Receipt className="w-4 h-4" /> Fechar
                    </button>
                  </div>
                )}
                {(selected.status === "AGUARDANDO_FISCAL" || selected.status === "FISCAL_REJEITADA") && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={reabrir} className={ghostBtn(isDark)}>
                      <RotateCcw className="w-4 h-4" /> Reabrir
                    </button>
                    <button onClick={() => emitir(selected.id)} disabled={emitindo === selected.id} className={primaryBtn}>
                      <Receipt className="w-4 h-4" />
                      {emitindo === selected.id
                        ? "Emitindo…"
                        : selected.status === "FISCAL_REJEITADA"
                          ? "Reemitir NFC-e"
                          : "Emitir NFC-e"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {modal === "abrir" && (
        <AbrirComandaModal
          terminalId={terminalId}
          onClose={() => setModal(null)}
          onDone={(a) => {
            upsert(a);
            setModal(null);
          }}
        />
      )}
      {modal === "parcial" && selected && (
        <PagamentoModal
          atendimento={selected}
          modo="PARCIAL"
          onClose={() => setModal(null)}
          onDone={(a) => {
            upsert(a);
            setModal(null);
          }}
        />
      )}
      {modal === "fechar" && selected && (
        <PagamentoModal
          atendimento={selected}
          modo="FECHAR"
          onClose={() => setModal(null)}
          onDone={(a) => {
            upsert(a);
            setModal(null);
          }}
        />
      )}
      {modal === "transferir" && selected && (
        <TransferirModal
          origem={selected}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            sync();
          }}
        />
      )}
      {modal === "pendentes" && (
        <PendentesEmissaoModal onClose={() => setModal(null)} onEmitir={emitir} />
      )}
      {modal === "turno" && <TurnoModal onClose={() => setModal(null)} />}
      {modal === "caixa" && <CaixaMovimentoModal onClose={() => setModal(null)} />}
    </div>
  );
}

function Row({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={isDark ? "text-slate-400" : "text-slate-500"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
