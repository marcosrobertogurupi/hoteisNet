"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Filter, ClipboardCheck } from "lucide-react";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";

interface PosLocation {
  id: string;
  name: string;
  active: boolean;
}

interface ItemConf {
  id: string;
  nome: string;
  categoria: string;
  codigoBarras: string;
  estoqueSistema: number;
  minimo: number;
}

interface Grupo {
  pdvId: string;
  pdv: string;
  local: string | null;
  itens: ItemConf[];
  totalItens: number;
  totalUnidades: number;
}

interface HotelInfo {
  name: string;
  cnpj: string;
  addressLine: string;
}

function nowStr(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConferenciaEstoquePage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();

  const [posLocations, setPosLocations] = useState<PosLocation[]>([]);
  const [posLocationId, setPosLocationId] = useState<string>(""); // "" = geral

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cadastros/pdv")
      .then((r) => r.json())
      .then((d) => d?.success && setPosLocations((d.posLocations || []).filter((p: PosLocation) => p.active)))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = posLocationId ? `?posLocationId=${posLocationId}` : "";
      const res = await fetch(`/api/relatorios/conferencia-estoque${qs}`);
      const data = await res.json();
      if (data.success) {
        setGrupos(data.grupos || []);
        setHotel(data.hotel || null);
        setGeneratedAt(nowStr());
      } else {
        setError(data.error || "Não foi possível gerar o relatório.");
      }
    } catch (err) {
      console.error("Erro ao gerar conferência de estoque:", err);
      setError("Falha de comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, [posLocationId]);

  const hotelDisplayName = hotel?.name || hotelNameTheme || "HOTEL";
  const escopoLabel = posLocationId
    ? posLocations.find((p) => p.id === posLocationId)?.name || "PDV"
    : "Todos os PDV";

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
            <ClipboardCheck className="w-5 h-5" style={{ color: theme.primaryColor }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Conferência de estoque por PDV</h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!generatedAt}
          className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir relatório
        </button>
      </div>

      {/* Filtros */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-end gap-3 print:hidden ${theme.bgCard}`}>
        <div className="w-64">
          <label className={`block text-[11px] font-semibold mb-1 ${theme.textMuted}`}>PDV</label>
          <select
            value={posLocationId}
            onChange={(e) => setPosLocationId(e.target.value)}
            className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
              theme.isDark
                ? "bg-slate-900 border-slate-700 text-slate-100"
                : "bg-white border-slate-300 text-slate-900"
            }`}
          >
            <option value="">Geral — todos os PDV</option>
            {posLocations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Gerando..." : "Gerar relatório"}
        </button>
        {error && <p className="w-full text-xs text-rose-500">{error}</p>}
      </div>

      {/* Documento para impressão */}
      {generatedAt && (
        <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-4 print:p-0 print:rounded-none print-container">
          <RelatorioPrintHeader
            hotelName={hotelDisplayName}
            hotelCnpj={hotel?.cnpj}
            hotelAddress={hotel?.addressLine}
            hotelLogo={hotelLogo}
            showLogo={showLogoInPrint}
            title={`Conferência de estoque — ${escopoLabel}`}
          />

          <div className="flex justify-between text-[11px] text-slate-600">
            <span>Emitido em: {generatedAt}</span>
            <span>Conferente: _______________________________</span>
          </div>

          {grupos.length === 0 && (
            <p className="p-4 text-center text-slate-400 italic">
              Nenhum produto alocado nos PDV selecionados.
            </p>
          )}

          {grupos.map((g) => (
            <div key={g.pdvId} className="space-y-1 avoid-break">
              <div className="font-bold text-sm border-b-2 border-slate-900 pt-2 pb-0.5">
                PDV: {g.pdv}
                {g.local ? ` — ${g.local}` : ""}
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-400">
                    <th className="p-1.5">Produto</th>
                    <th className="p-1.5">Grupo</th>
                    <th className="p-1.5">Cód. Barras</th>
                    <th className="p-1.5 text-center">Est. Sistema</th>
                    <th className="p-1.5 text-center">Contagem física</th>
                    <th className="p-1.5 text-center">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((i) => (
                    <tr key={i.id} className="border-b border-slate-200 avoid-break">
                      <td className="p-1.5">{i.nome}</td>
                      <td className="p-1.5">{i.categoria}</td>
                      <td className="p-1.5">{i.codigoBarras || "-"}</td>
                      <td className="p-1.5 text-center">{i.estoqueSistema}</td>
                      <td className="p-1.5 text-center text-slate-300">_______</td>
                      <td className="p-1.5 text-center text-slate-300">_______</td>
                    </tr>
                  ))}
                  {g.itens.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-3 text-center text-slate-400 italic">
                        Nenhum produto alocado neste PDV.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-bold">
                    <td className="p-1.5" colSpan={3}>
                      {g.totalItens} produto(s) · {g.totalUnidades} unidade(s) no sistema
                    </td>
                    <td className="p-1.5 text-center">{g.totalUnidades}</td>
                    <td className="p-1.5" />
                    <td className="p-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          <p className="text-[10px] text-slate-500 pt-2 print:hidden">
            &quot;Est. Sistema&quot; é o saldo atual do PDV no HoteisNet no momento da emissão. O
            funcionário anota a contagem física e a diferença para ajuste posterior.
          </p>
        </div>
      )}
    </div>
  );
}
