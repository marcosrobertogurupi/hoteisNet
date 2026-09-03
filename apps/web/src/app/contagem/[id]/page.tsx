"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  Loader2,
  Minus,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
  CheckCircle2,
} from "lucide-react";
import BarcodeScanner from "@/components/contagem/BarcodeScanner";

interface CountInfo {
  id: string;
  alvo: string;
  isGeneral: boolean;
  status: "OPEN" | "DONE" | "RECONCILED" | "CANCELLED";
  conferente: string;
}

interface Item {
  id: string;
  productId: string | null;
  codigoBarras: string | null;
  nome: string;
  quantidade: number;
  naoEncontrado: boolean;
  observacao: string | null;
}

interface SearchHit {
  id: string;
  nome: string;
  referencia: string | null;
  codigoBarras: string | null;
  unidade: string | null;
}

type Pending =
  | { kind: "scan"; code: string; label: string }
  | { kind: "product"; productId: string; label: string }
  | { kind: "edit"; item: Item };

export default function ContagemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [info, setInfo] = useState<CountInfo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [scanning, setScanning] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [finishing, setFinishing] = useState(false);

  // Anti-releitura do MESMO produto logo após confirmar: quando o funcionário confirma uma
  // leitura e move o celular para o próximo item, a câmera costuma pegar o código anterior de
  // novo antes de mirar no novo produto — isso somava no item errado. `lastScan` guarda o último
  // código confirmado; `scanPaused` congela a câmera por ~1,5 s depois de cada confirmação.
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [scanPaused, setScanPaused] = useState(false);
  const scanPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SAME_CODE_LOCKOUT_MS = 6000;

  const flash = useCallback((text: string, tone: "ok" | "warn" = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock-count/counts/${id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoadError(data.error || "Contagem não encontrada.");
        return;
      }
      setInfo(data.count);
      setItems(data.items || []);
    } catch {
      setLoadError("Falha de comunicação com o servidor.");
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Recarrega ao voltar para o app (troca de aba / desbloqueio) — pega o status novo se o
  // assinante finalizou o confronto no computador enquanto esta tela estava aberta.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const isOpen = info?.status === "OPEN";

  // ——— leitura da câmera ———
  const onDetected = useCallback((code: string) => {
    // Ignora o mesmo código lido de novo logo após ter sido confirmado (câmera ainda apontada
    // para o item anterior). Depois da janela, ler o mesmo código volta a somar normalmente.
    if (code === lastScanRef.current.code && Date.now() - lastScanRef.current.at < SAME_CODE_LOCKOUT_MS) {
      return;
    }
    setPending((prev) => (prev ? prev : { kind: "scan", code, label: code }));
    setQty(1);
  }, []);

  useEffect(() => () => {
    if (scanPauseTimer.current) clearTimeout(scanPauseTimer.current);
  }, []);

  // ——— busca manual ———
  useEffect(() => {
    if (!searchOpen) return;
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock-count/product-search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setSearchHits(data.success ? data.products : []);
      } catch {
        setSearchHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, searchOpen]);

  const confirmPending = async () => {
    if (!pending) return;
    const n = Math.trunc(qty);
    if (pending.kind !== "edit" && (!Number.isFinite(n) || n <= 0)) {
      flash("Informe uma quantidade maior que zero.", "warn");
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (pending.kind === "scan") {
        res = await fetch(`/api/stock-count/counts/${id}/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pending.code, quantity: n }),
        });
      } else if (pending.kind === "product") {
        res = await fetch(`/api/stock-count/counts/${id}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: pending.productId, quantity: n }),
        });
      } else {
        res = await fetch(`/api/stock-count/counts/${id}/items/${pending.item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: Math.max(0, n) }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        flash(data.error || "Não foi possível salvar.", "warn");
        return;
      }
      if (pending.kind === "scan" || pending.kind === "product") {
        const verb = data.outcome === "summed" ? "somado" : "lançado";
        if (data.notFound) flash(`"${data.nome}" não está no cadastro — ${verb} assim mesmo (${data.qty}).`, "warn");
        else flash(`${data.nome} — ${verb} (total ${data.qty}).`, "ok");
        if (pending.kind === "scan") lastScanRef.current = { code: pending.code, at: Date.now() };
        // Congela a câmera por um instante para o funcionário mirar no próximo produto sem
        // relançar o atual.
        setScanPaused(true);
        if (scanPauseTimer.current) clearTimeout(scanPauseTimer.current);
        scanPauseTimer.current = setTimeout(() => setScanPaused(false), 1500);
      } else {
        flash("Quantidade atualizada.", "ok");
      }
      setPending(null);
      setSearchOpen(false);
      setSearchTerm("");
      await load();
    } catch {
      flash("Falha de comunicação.", "warn");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: Item) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/stock-count/counts/${id}/items/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flash(data.error || "Não foi possível remover.", "warn");
        return;
      }
      setPending(null);
      flash("Item removido.", "ok");
      await load();
    } catch {
      flash("Falha de comunicação.", "warn");
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/stock-count/counts/${id}/finish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flash(data.error || "Não foi possível finalizar.", "warn");
        setFinishing(false);
        return;
      }
      router.push("/contagem");
    } catch {
      flash("Falha de comunicação.", "warn");
      setFinishing(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] text-slate-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] text-slate-100 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-rose-400">{loadError}</p>
        <button onClick={() => router.push("/contagem")} className="px-4 py-2 rounded-xl bg-slate-800 text-sm font-semibold">
          Voltar
        </button>
      </div>
    );
  }

  const totalUnidades = items.reduce((s, i) => s + i.quantidade, 0);
  const naoEncontrados = items.filter((i) => i.naoEncontrado).length;

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0f1a]/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/contagem")} className="p-2 -ml-2 text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{info.alvo}</p>
          <p className="text-[11px] text-slate-500">
            {items.length} item(ns) · {totalUnidades} unid.
            {naoEncontrados > 0 && <span className="text-amber-400"> · {naoEncontrados} sem cadastro</span>}
          </p>
        </div>
        {isOpen && (
          <button
            onClick={() => setScanning((s) => !s)}
            className={`p-2.5 rounded-xl border transition ${
              scanning
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
            title={scanning ? "Pausar câmera" : "Ligar câmera"}
          >
            {scanning ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>
        )}
      </div>

      {!isOpen && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {info.status === "DONE"
            ? "Contagem finalizada — aguardando o confronto do assinante. Somente leitura."
            : info.status === "RECONCILED"
              ? "Contagem já confrontada pelo assinante. Somente leitura."
              : "Contagem cancelada."}
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {isOpen && scanning && (
          <div className="relative">
            <BarcodeScanner active={scanning && !pending && !searchOpen && !scanPaused} onDetected={onDetected} />
            {scanPaused && (
              <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center text-emerald-300 text-sm font-semibold pointer-events-none">
                Mire no próximo produto…
              </div>
            )}
          </div>
        )}

        {isOpen && (
          <button
            onClick={() => {
              setSearchOpen(true);
              setSearchTerm("");
              setSearchHits([]);
            }}
            className="w-full py-3 rounded-2xl bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-200 flex items-center justify-center gap-2 hover:border-emerald-500/40 transition"
          >
            <Search className="w-4 h-4" /> Buscar produto pelo nome
          </button>
        )}

        {/* Lista de itens contados */}
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-10">
              Nenhum item contado ainda. {isOpen ? "Aponte a câmera para o código de barras." : ""}
            </p>
          )}
          {items.map((it) => (
            <button
              key={it.id}
              disabled={!isOpen}
              onClick={() => {
                setPending({ kind: "edit", item: it });
                setQty(it.quantidade);
              }}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition ${
                it.naoEncontrado
                  ? "bg-amber-500/5 border-amber-500/30"
                  : "bg-slate-900/80 border-slate-800"
              } ${isOpen ? "hover:border-emerald-500/40" : "opacity-90"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{it.nome}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {it.codigoBarras || "sem código"}
                  {it.naoEncontrado && (
                    <span className="text-amber-400 inline-flex items-center gap-1 ml-1">
                      <TriangleAlert className="w-3 h-3" /> não encontrado no cadastro
                    </span>
                  )}
                </p>
              </div>
              <span className="text-lg font-bold tabular-nums shrink-0">{it.quantidade}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rodapé — finalizar */}
      {isOpen && (
        <div className="fixed bottom-0 inset-x-0 z-10 bg-[#0a0f1a]/95 backdrop-blur border-t border-slate-800 p-4">
          <button
            onClick={() => {
              if (items.length === 0) {
                flash("Faça pelo menos uma leitura antes de finalizar.", "warn");
                return;
              }
              if (confirm("Finalizar a contagem? Depois disso não dá para lançar mais itens.")) finish();
            }}
            disabled={finishing}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-60"
          >
            {finishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            Finalizar contagem
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-16 inset-x-4 z-40 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
            toast.tone === "ok" ? "bg-emerald-600 text-white" : "bg-amber-500 text-black"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Sheet de quantidade / edição */}
      {pending && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-sm bg-[#0e1524] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  {pending.kind === "edit" ? "Ajustar quantidade" : "Quantidade contada"}
                </p>
                <p className="text-base font-bold break-all leading-tight">
                  {pending.kind === "edit" ? pending.item.nome : pending.label}
                </p>
                {pending.kind === "scan" && items.some((it) => it.codigoBarras === pending.code) && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    Este código já está na contagem — a quantidade vai <b>somar</b> à existente.
                  </p>
                )}
              </div>
              <button onClick={() => setPending(null)} className="p-1.5 text-slate-400 hover:text-white shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setQty((q) => Math.max(pending.kind === "edit" ? 0 : 1, Math.trunc(q) - 1))}
                className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-24 text-center text-3xl font-bold bg-transparent border-b-2 border-slate-700 focus:outline-none focus:border-emerald-500 py-1"
              />
              <button
                onClick={() => setQty((q) => Math.trunc(q) + 1)}
                className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              {pending.kind === "edit" && (
                <button
                  onClick={() => removeItem(pending.item)}
                  disabled={saving}
                  className="px-4 py-3 rounded-2xl bg-rose-600/20 border border-rose-600/40 text-rose-300 font-semibold flex items-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" /> Remover
                </button>
              )}
              <button
                onClick={confirmPending}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {pending.kind === "edit" ? "Salvar" : "Lançar na contagem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet de busca manual */}
      {searchOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md bg-[#0e1524] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Buscar produto</h3>
              <button onClick={() => setSearchOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nome, referência ou código"
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-11 pr-4 py-3 text-base focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {searching && <p className="text-xs text-slate-500 px-1">Buscando…</p>}
              {!searching && searchTerm.trim().length >= 2 && searchHits.length === 0 && (
                <p className="text-xs text-slate-500 px-1">Nenhum produto encontrado.</p>
              )}
              {searchHits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setPending({ kind: "product", productId: h.id, label: h.nome });
                    setQty(1);
                  }}
                  className="w-full text-left p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition"
                >
                  <p className="text-sm font-semibold">{h.nome}</p>
                  <p className="text-[11px] text-slate-500">
                    {[h.referencia, h.codigoBarras, h.unidade].filter(Boolean).join(" · ") || "—"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
