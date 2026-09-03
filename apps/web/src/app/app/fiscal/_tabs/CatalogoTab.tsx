"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UtensilsCrossed, Package, AlertTriangle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { inputCls, cardCls, theadCls, rowCls } from "../_lib";

interface PerfilRef {
  id: string;
  name: string;
  ncm: string;
  cfop: string;
}
interface Item {
  id: string;
  nome: string;
  preco: number | string;
  perfilFiscalId: string | null;
  perfilFiscal: PerfilRef | null;
}
interface Perfil {
  id: string;
  name: string;
}

export default function CatalogoTab() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [pratos, setPratos] = useState<Item[]>([]);
  const [produtos, setProdutos] = useState<Item[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const sync = useCallback(async () => {
    try {
      const [cat, pf] = await Promise.all([
        fetch("/api/pdv/catalogo").then((r) => r.json()),
        fetch("/api/pdv/perfis-fiscais").then((r) => r.json()),
      ]);
      if (cat?.success) {
        setPratos(cat.pratos);
        setProdutos(cat.produtos);
      }
      if (pf?.success) setPerfis(pf.perfis.filter((p: any) => p.active !== false));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const assign = async (tipo: "PRATO" | "PRODUTO", id: string, perfilFiscalId: string) => {
    const res = await fetch("/api/pdv/catalogo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, id, perfilFiscalId: perfilFiscalId || null }),
    });
    const data = await res.json();
    if (!data.success) return toast.error(data.error || "Não foi possível atribuir o perfil.");
    // Atualiza localmente sem refetch completo.
    const setter = tipo === "PRATO" ? setPratos : setProdutos;
    setter((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, perfilFiscalId: perfilFiscalId || null, perfilFiscal: perfis.find((p) => p.id === perfilFiscalId) as any || null }
          : it
      )
    );
  };

  const missingCount = useMemo(
    () => [...pratos, ...produtos].filter((i) => !i.perfilFiscalId).length,
    [pratos, produtos]
  );

  const rows = (items: Item[], tipo: "PRATO" | "PRODUTO") =>
    items
      .filter((i) => i.nome.toLowerCase().includes(query.toLowerCase()))
      .filter((i) => !onlyMissing || !i.perfilFiscalId)
      .map((i) => (
        <tr key={i.id} className={rowCls(isDark)}>
          <td className="px-5 py-3">
            <span className={`inline-flex items-center gap-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              {tipo === "PRATO" ? <UtensilsCrossed className="w-3.5 h-3.5 opacity-60" /> : <Package className="w-3.5 h-3.5 opacity-60" />}
              {i.nome}
            </span>
          </td>
          <td className="px-5 py-3 font-mono">R$ {Number(i.preco).toFixed(2)}</td>
          <td className="px-5 py-3">
            <select value={i.perfilFiscalId || ""} onChange={(e) => assign(tipo, i.id, e.target.value)} className={`${inputCls(isDark)} py-1.5`}>
              <option value="">— sem perfil —</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </td>
          <td className="px-5 py-3">
            {i.perfilFiscal ? (
              <span className="font-mono text-[11px] opacity-70">
                NCM {i.perfilFiscal.ncm} · CFOP {i.perfilFiscal.cfop}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-500 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5" /> não vende no PDV
              </span>
            )}
          </td>
        </tr>
      ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Vincule um perfil fiscal a cada prato e produto. Itens sem perfil não podem ser vendidos no PDV.
          {missingCount > 0 && <strong className="text-amber-500"> {missingCount} sem perfil.</strong>}
        </p>
        <label className={`flex items-center gap-2 text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Só sem perfil
        </label>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar item…"
        className={`${inputCls(isDark)} max-w-xs`}
      />

      {perfis.length === 0 && !loading && (
        <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Cadastre ao menos um perfil fiscal na aba “Perfis Fiscais” antes de vincular itens.</span>
        </div>
      )}

      <div className={cardCls(isDark)}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={theadCls(isDark)}>
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Preço</th>
                <th className="px-5 py-3">Perfil fiscal</th>
                <th className="px-5 py-3">Tributação</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/60" : "divide-slate-200"}`}>
              {rows(pratos, "PRATO")}
              {rows(produtos, "PRODUTO")}
              {!loading && pratos.length + produtos.length === 0 && (
                <tr>
                  <td colSpan={4} className={`px-5 py-12 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Nenhum prato ou produto cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
