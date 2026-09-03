"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Filter, PackageSearch, Search } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";

interface CatItem {
  tipo: "PRATO" | "PRODUTO";
  id: string;
  nome: string;
  categoria: string | null;
  preco: number;
}

interface Linha {
  id: string;
  dataHora: string;
  origem: string;
  caixa: string;
  operador: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
}

interface Grupo {
  pdvId: string | null;
  pdv: string;
  linhas: Linha[];
  quantidade: number;
  valor: number;
}

interface HotelInfo {
  name: string;
  cnpj: string;
  addressLine: string;
}

function getTodayDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VendasItemPorPdvPage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();

  const [from, setFrom] = useState(getTodayDateStr());
  const [to, setTo] = useState(getTodayDateStr());
  const [catalogo, setCatalogo] = useState<CatItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<CatItem | null>(null);

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [totais, setTotais] = useState<{ quantidade: number; valor: number; lancamentos: number } | null>(null);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [applied, setApplied] = useState<{ from: string; to: string; nome: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pdv/catalogo-venda")
      .then((r) => r.json())
      .then((d) => d?.success && setCatalogo(d.itens))
      .catch(() => {});
  }, []);

  const sugestoes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalogo
      .filter((i) => i.nome.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, catalogo]);

  const fetchData = useCallback(async () => {
    if (!selectedItem || !from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/relatorios/vendas-item-por-pdv?from=${from}&to=${to}&tipo=${selectedItem.tipo}&itemId=${selectedItem.id}`
      );
      const data = await res.json();
      if (data.success) {
        setGrupos(data.grupos || []);
        setTotais(data.totais || null);
        setHotel(data.hotel || null);
        setApplied({ from, to, nome: data.item?.nome || selectedItem.nome });
      } else {
        setError(data.error || "Não foi possível gerar o relatório.");
      }
    } catch (err) {
      console.error("Erro ao gerar relatório de vendas por item:", err);
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [selectedItem, from, to]);

  const hotelDisplayName = hotel?.name || hotelNameTheme || "HOTEL";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/app/relatorios"
            className={`p-2 rounded-lg border transition-colors ${theme.bgCard}`}
            title="Voltar aos Relatórios"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <PackageSearch className="w-5 h-5" style={{ color: theme.primaryColor }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Vendas de item por PDV</h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!applied}
          className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir relatório
        </button>
      </div>

      {/* Filtros */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-end gap-3 print:hidden ${theme.bgCard}`}>
        <div className="w-44">
          <CustomDatePicker
            label="Data de venda — de"
            value={from}
            onChange={setFrom}
            isDark={theme.isDark}
            type="date"
          />
        </div>
        <div className="w-44">
          <CustomDatePicker
            label="Data de venda — até"
            value={to}
            onChange={setTo}
            isDark={theme.isDark}
            type="date"
          />
        </div>

        <div className="w-72 relative">
          <label className={`block text-[11px] font-semibold mb-1 ${theme.textMuted}`}>Item</label>
          {selectedItem ? (
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${theme.bgCard}`}
            >
              <span className="truncate">
                <span className={`font-semibold ${theme.textMain}`}>{selectedItem.nome}</span>{" "}
                <span className={theme.textMuted}>
                  ({selectedItem.tipo === "PRATO" ? "Prato" : "Produto"})
                </span>
              </span>
              <button
                onClick={() => {
                  setSelectedItem(null);
                  setQuery("");
                }}
                className="text-rose-500 font-bold shrink-0"
              >
                trocar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar prato ou produto…"
                  className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none ${
                    theme.isDark
                      ? "bg-slate-900 border-slate-700 text-slate-100"
                      : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
              {sugestoes.length > 0 && (
                <div
                  className={`absolute z-20 mt-1 w-full rounded-xl border overflow-hidden shadow-lg ${
                    theme.isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                  }`}
                >
                  {sugestoes.map((s) => (
                    <button
                      key={`${s.tipo}-${s.id}`}
                      onClick={() => {
                        setSelectedItem(s);
                        setQuery("");
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition border-b last:border-b-0 ${
                        theme.isDark
                          ? "hover:bg-slate-800 border-slate-800 text-slate-200"
                          : "hover:bg-slate-50 border-slate-100 text-slate-700"
                      }`}
                    >
                      <span className="truncate">
                        {s.nome}{" "}
                        <span className="text-slate-400">
                          · {s.tipo === "PRATO" ? "Prato" : "Produto"}
                        </span>
                      </span>
                      <span className="font-mono shrink-0">{money(s.preco)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <button
          onClick={fetchData}
          disabled={loading || !selectedItem}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Gerando..." : "Gerar relatório"}
        </button>

        {error && <p className="w-full text-xs text-rose-500">{error}</p>}
      </div>

      {/* Documento para impressão */}
      {applied && (
        <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-3 print:p-0 print:rounded-none print-container">
          <RelatorioPrintHeader
            hotelName={hotelDisplayName}
            hotelCnpj={hotel?.cnpj}
            hotelAddress={hotel?.addressLine}
            hotelLogo={hotelLogo}
            showLogo={showLogoInPrint}
            title={`Vendas de "${applied.nome}" por PDV — ${fmtDate(applied.from)} a ${fmtDate(applied.to)}`}
          />

          {grupos.length === 0 && (
            <p className="p-4 text-center text-slate-400 italic">
              Nenhuma venda deste item no período informado.
            </p>
          )}

          {grupos.map((g) => (
            <div key={g.pdvId ?? "none"} className="space-y-1 avoid-break">
              <div className="font-bold text-sm border-b-2 border-slate-900 pt-2 pb-0.5">
                PDV: {g.pdv}
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-400">
                    <th className="p-1.5">Data / Hora</th>
                    <th className="p-1.5">Origem</th>
                    <th className="p-1.5">Caixa</th>
                    <th className="p-1.5">Operador</th>
                    <th className="p-1.5 text-center">Qtd</th>
                    <th className="p-1.5 text-right">Vlr.Unit.</th>
                    <th className="p-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.id} className="border-b border-slate-200 avoid-break">
                      <td className="p-1.5">{fmtDateTime(l.dataHora)}</td>
                      <td className="p-1.5">{l.origem}</td>
                      <td className="p-1.5">{l.caixa}</td>
                      <td className="p-1.5">{l.operador}</td>
                      <td className="p-1.5 text-center">{l.quantidade}</td>
                      <td className="p-1.5 text-right">{money(l.precoUnitario)}</td>
                      <td className="p-1.5 text-right">{money(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-bold">
                    <td className="p-1.5" colSpan={4}>
                      Subtotal {g.pdv}
                    </td>
                    <td className="p-1.5 text-center">{g.quantidade}</td>
                    <td className="p-1.5" />
                    <td className="p-1.5 text-right">{money(g.valor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {totais && grupos.length > 0 && (
            <div className="border-t-4 border-double border-slate-900 pt-2 font-bold space-y-0.5">
              <div className="flex justify-between">
                <span>Total geral — quantidade</span>
                <span>{totais.quantidade}</span>
              </div>
              <div className="flex justify-between">
                <span>Total geral — valor</span>
                <span>{money(totais.valor)}</span>
              </div>
              <div className="flex justify-between">
                <span>Lançamentos</span>
                <span>{totais.lancamentos}</span>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-500 pt-2 print:hidden">
            Cobre o consumo lançado no quarto e as comandas do PDV do restaurante. Itens cancelados
            não entram. A data/hora e o operador são os do momento em que o item foi lançado.
          </p>
        </div>
      )}
    </div>
  );
}
