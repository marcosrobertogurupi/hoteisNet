"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Loader2,
  TriangleAlert,
  PackageX,
  Ban,
  CheckCircle2,
  Warehouse,
  Store,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { cadastroUI } from "../../../cadastros/_ui";

interface Row {
  productId: string;
  itemId: string | null;
  nome: string;
  codigoBarras: string | null;
  sistema: number;
  contado: number;
  contadoNaContagem: boolean;
  diferenca: number;
  aplicado: { de: number | null; para: number | null; em: string } | null;
}

interface SemCadastro {
  id: string;
  codigoBarras: string | null;
  nome: string;
  contado: number;
  observacao: string | null;
}

interface CountInfo {
  id: string;
  alvo: string;
  isGeneral: boolean;
  status: "OPEN" | "DONE" | "RECONCILED" | "CANCELLED";
  conferente: string;
  observacao: string | null;
  finalizadaEm: string | null;
  confrontadaEm: string | null;
  confrontadaPor: string | null;
}

export default function ReconcilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const c = cadastroUI(isDark);
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { isAdmin } = useSession();

  const [info, setInfo] = useState<CountInfo | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [semCadastro, setSemCadastro] = useState<SemCadastro[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [targets, setTargets] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock/counts/${id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoadError(data.error || "Contagem não encontrada.");
        return;
      }
      setInfo(data.count);
      setRows(data.rows || []);
      setSemCadastro(data.semCadastro || []);
      // alvo inicial de cada linha = o que foi contado; seleção automática só p/ divergência real
      // de um produto que foi lido (produto não lido nunca é zerado sem o admin marcar).
      const t: Record<string, number> = {};
      const s: Record<string, boolean> = {};
      for (const r of data.rows as Row[]) {
        t[r.productId] = r.contado;
        if (!r.aplicado && r.contadoNaContagem && r.diferenca !== 0) s[r.productId] = true;
      }
      setTargets(t);
      setSelected(s);
    } catch {
      setLoadError("Falha de comunicação com o servidor.");
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isDone = info?.status === "DONE";
  const canEdit = isAdmin && isDone;

  const contados = useMemo(() => rows.filter((r) => r.contadoNaContagem), [rows]);
  const naoLidos = useMemo(() => rows.filter((r) => !r.contadoNaContagem), [rows]);

  const selectedList = useMemo(
    () => rows.filter((r) => selected[r.productId] && !r.aplicado),
    [rows, selected]
  );

  const apply = async (finalize: boolean) => {
    const adjustments = selectedList.map((r) => ({ productId: r.productId, toQty: Math.max(0, Math.trunc(targets[r.productId] ?? r.contado)) }));

    if (!finalize && adjustments.length === 0) {
      toast.warning("Marque ao menos uma linha para ajustar.");
      return;
    }
    if (finalize) {
      const msg =
        adjustments.length > 0
          ? `Aplicar ${adjustments.length} ajuste(s) de saldo e concluir a conferência?`
          : "Concluir a conferência sem aplicar nenhum ajuste?";
      const ok = await confirmDialog({ title: "Concluir conferência", message: msg, confirmLabel: "Concluir" });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/stock/counts/${id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustments, finalize }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível aplicar os ajustes.");
        return;
      }
      if (finalize) {
        toast.success("Conferência concluída.");
        router.push("/app/stock/contagens");
        return;
      }
      toast.success(`${data.applied} ajuste(s) aplicado(s).`);
      await load();
    } catch {
      toast.error("Falha de comunicação.");
    } finally {
      setBusy(false);
    }
  };

  const cancelCount = async () => {
    const ok = await confirmDialog({
      title: "Cancelar contagem",
      message: "Descartar esta contagem sem aplicar nenhum ajuste de saldo?",
      confirmLabel: "Cancelar contagem",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/stock/counts/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Não foi possível cancelar.");
        return;
      }
      toast.success("Contagem cancelada.");
      router.push("/app/stock/contagens");
    } catch {
      toast.error("Falha de comunicação.");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }
  if (loadError || !info) {
    return (
      <div className="space-y-4">
        <Link href="/app/stock/contagens" className={c.backLink}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <p className="text-sm text-rose-500">{loadError}</p>
      </div>
    );
  }

  const diffColor = (n: number) => (n === 0 ? c.muted : n > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400");

  const RowLine = ({ r, allowSelect }: { r: Row; allowSelect: boolean }) => {
    const applied = !!r.aplicado;
    const checked = !!selected[r.productId];
    return (
      <tr className={`border-b ${c.tdivide} ${applied ? "opacity-60" : ""}`}>
        <td className="px-3 py-2.5">
          {canEdit && allowSelect && !applied ? (
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setSelected((s) => ({ ...s, [r.productId]: e.target.checked }))}
            />
          ) : applied ? (
            <CheckCircle2 className="w-4 h-4 text-sky-500" />
          ) : null}
        </td>
        <td className="px-3 py-2.5">
          <div className={`font-semibold ${c.strong}`}>{r.nome}</div>
          <div className={`text-[10px] font-mono ${c.empty}`}>{r.codigoBarras || "sem código"}</div>
        </td>
        <td className={`px-3 py-2.5 text-center font-mono ${c.strong}`}>{r.sistema}</td>
        <td className={`px-3 py-2.5 text-center font-mono ${c.strong}`}>
          {r.contadoNaContagem ? r.contado : <span className={c.empty}>não lido</span>}
        </td>
        <td className={`px-3 py-2.5 text-center font-mono font-bold ${diffColor(r.diferenca)}`}>
          {r.diferenca > 0 ? `+${r.diferenca}` : r.diferenca}
        </td>
        <td className="px-3 py-2.5 text-center">
          {applied ? (
            <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400">
              {r.aplicado!.de} → {r.aplicado!.para}
            </span>
          ) : canEdit && checked ? (
            <input
              type="number"
              min={0}
              value={targets[r.productId] ?? r.contado}
              onChange={(e) => setTargets((t) => ({ ...t, [r.productId]: Number(e.target.value) }))}
              className={`w-20 text-center font-mono ${c.field}`}
            />
          ) : (
            <span className={c.empty}>—</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      <Link href="/app/stock/contagens" className={c.backLink}>
        <ArrowLeft className="w-4 h-4" /> Voltar para as conferências
      </Link>

      <div className={c.headerCard}>
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl">
            {info.isGeneral ? <Warehouse className="w-7 h-7" /> : <Store className="w-7 h-7" />}
          </div>
          <div>
            <h1 className={c.title}>{info.alvo}</h1>
            <p className={c.subtitle}>
              Contado por {info.conferente}
              {info.finalizadaEm &&
                ` · finalizada ${new Date(info.finalizadaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
            </p>
          </div>
        </div>
      </div>

      {!isDone && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"} ${c.muted}`}>
          <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
          {info.status === "OPEN"
            ? "A contagem ainda está em andamento no celular. Aguarde o funcionário finalizar para confrontar."
            : info.status === "RECONCILED"
              ? `Conferência já concluída por ${info.confrontadaPor || "—"}. Somente leitura.`
              : "Contagem cancelada. Somente leitura."}
        </div>
      )}

      {isDone && !isAdmin && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${isDark ? "bg-slate-900 border-slate-800" : "bg-amber-50 border-amber-200"} text-amber-600 dark:text-amber-400`}>
          <TriangleAlert className="w-4 h-4 shrink-0" /> Aplicar ajustes de saldo é restrito a administradores.
        </div>
      )}

      {/* Produtos contados */}
      <div className={c.tableCard}>
        <div className={`px-4 py-3 border-b ${c.modalDivider}`}>
          <h3 className={`text-sm font-semibold ${c.strong}`}>Produtos contados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={c.thead}>
              <tr>
                <th className="px-3 py-3 w-8"></th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3 text-center">Sistema</th>
                <th className="px-3 py-3 text-center">Contado</th>
                <th className="px-3 py-3 text-center">Diferença</th>
                <th className="px-3 py-3 text-center">Ajustar para</th>
              </tr>
            </thead>
            <tbody>
              {contados.map((r) => (
                <RowLine key={r.productId} r={r} allowSelect />
              ))}
              {contados.length === 0 && (
                <tr>
                  <td colSpan={6} className={`px-3 py-8 text-center ${c.empty}`}>Nenhum produto do cadastro foi lido nesta contagem.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Produtos não lidos */}
      {naoLidos.length > 0 && (
        <div className={c.tableCard}>
          <div className={`px-4 py-3 border-b ${c.modalDivider} flex items-center gap-2`}>
            <PackageX className="w-4 h-4 text-amber-500" />
            <h3 className={`text-sm font-semibold ${c.strong}`}>Com saldo no sistema, mas não lidos na contagem</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={c.thead}>
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3">Produto</th>
                  <th className="px-3 py-3 text-center">Sistema</th>
                  <th className="px-3 py-3 text-center">Contado</th>
                  <th className="px-3 py-3 text-center">Diferença</th>
                  <th className="px-3 py-3 text-center">Ajustar para</th>
                </tr>
              </thead>
              <tbody>
                {naoLidos.map((r) => (
                  <RowLine key={r.productId} r={r} allowSelect />
                ))}
              </tbody>
            </table>
          </div>
          <p className={`px-4 py-2.5 text-[11px] ${c.empty}`}>
            Marque só os que realmente devem ser zerados/ajustados — um produto pode não ter sido lido só porque a contagem
            não cobriu tudo.
          </p>
        </div>
      )}

      {/* Sem cadastro */}
      {semCadastro.length > 0 && (
        <div className={c.tableCard}>
          <div className={`px-4 py-3 border-b ${c.modalDivider} flex items-center gap-2`}>
            <TriangleAlert className="w-4 h-4 text-amber-500" />
            <h3 className={`text-sm font-semibold ${c.strong}`}>Códigos lidos que não existem no cadastro</h3>
          </div>
          <div className="divide-y">
            {semCadastro.map((s) => (
              <div key={s.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${c.tdivide}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${c.strong}`}>{s.codigoBarras || s.nome}</p>
                  <p className={`text-[11px] ${c.empty}`}>Contado: {s.contado} · {s.observacao || "—"}</p>
                </div>
                <Link
                  href={`/app/cadastros/produtos?novo=${encodeURIComponent(s.codigoBarras || "")}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0"
                >
                  Cadastrar produto
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      {canEdit && (
        <div className={`sticky bottom-0 -mx-4 md:-mx-8 px-4 md:px-8 py-4 border-t backdrop-blur ${isDark ? "bg-slate-950/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={cancelCount}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Cancelar contagem
            </button>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${c.muted}`}>{selectedList.length} selecionado(s)</span>
              <button
                onClick={() => apply(false)}
                disabled={busy || selectedList.length === 0}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${c.iconBtn} ${c.strong} disabled:opacity-50`}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aplicar selecionados
              </button>
              <button
                onClick={() => apply(true)}
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> Aplicar e concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
