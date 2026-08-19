"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RefreshCw, BedDouble } from "lucide-react";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface QuartoOcupadoRow {
  id: string;
  number: string;
  guestName: string;
  pessoas: number;
  checkInDate: string | null;
  expectedCheckOut: string | null;
}

interface HotelInfo {
  name: string;
  cnpj: string;
  addressLine: string;
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
    second: "2-digit",
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function QuartosOcupadosPage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [rows, setRows] = useState<QuartoOcupadoRow[]>([]);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [totalPessoas, setTotalPessoas] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorios/quartos-ocupados?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.rooms || []);
        setHotel(data.hotel || null);
        setTotalPessoas(data.totalPessoas || 0);
      }
    } catch (err) {
      console.error("Erro ao buscar quartos ocupados:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            <BedDouble className="w-5 h-5" style={{ color: "#10B981" }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Quartos ocupados</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${theme.bgCard}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            style={{ backgroundColor: theme.primaryColor }}
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir relatório
          </button>
        </div>
      </div>

      {/* Printable Document */}
      <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-3 print:p-0 print:rounded-none print-container">
        <RelatorioPrintHeader
          hotelName={hotelDisplayName}
          hotelCnpj={hotel?.cnpj}
          hotelAddress={hotel?.addressLine}
          hotelLogo={hotelLogo}
          showLogo={showLogoInPrint}
          title="Quartos ocupados"
        />

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="p-1.5 w-24">Quarto</th>
              <th className="p-1.5">Hóspede</th>
              <th className="p-1.5 text-center w-20">Pessoas</th>
              <th className="p-1.5">Entrada</th>
              <th className="p-1.5">Previsão de saída</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-300 avoid-break">
                <td className="p-1.5 font-bold">{r.number}</td>
                <td className="p-1.5">{r.guestName}</td>
                <td className="p-1.5 text-center">{r.pessoas}</td>
                <td className="p-1.5">{fmtDateTime(r.checkInDate)}</td>
                <td className="p-1.5">{fmtDate(r.expectedCheckOut)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                  {loading ? "Carregando..." : "Nenhum quarto ocupado no momento."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="space-y-0.5 pt-1">
          <div className="font-bold">Qtd.Quartos Ocupados: {rows.length}</div>
          <div className="font-bold">Qtd.Pessoas: {totalPessoas}</div>
        </div>
      </div>
    </div>
  );
}
