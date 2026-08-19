"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RefreshCw, Sparkles } from "lucide-react";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface QuartoLimpezaRow {
  id: string;
  number: string;
  floor: string;
  description: string;
}

interface HotelInfo {
  name: string;
  cnpj: string;
  addressLine: string;
}

export default function QuartosLimpezaPage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [rooms, setRooms] = useState<QuartoLimpezaRow[]>([]);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorios/quartos-limpeza?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.success) {
        setRooms(data.rooms || []);
        setHotel(data.hotel || null);
      }
    } catch (err) {
      console.error("Erro ao buscar quartos para limpeza:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groupedByFloor = useMemo(() => {
    const groups = new Map<string, QuartoLimpezaRow[]>();
    for (const room of rooms) {
      if (!groups.has(room.floor)) groups.set(room.floor, []);
      groups.get(room.floor)!.push(room);
    }
    return Array.from(groups.entries());
  }, [rooms]);

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
            <Sparkles className="w-5 h-5" style={{ color: "#EAB308" }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Quartos para limpeza</h1>
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
      <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-4 print:p-0 print:rounded-none print-container">
        <RelatorioPrintHeader
          hotelName={hotelDisplayName}
          hotelCnpj={hotel?.cnpj}
          hotelAddress={hotel?.addressLine}
          hotelLogo={hotelLogo}
          showLogo={showLogoInPrint}
          title="Quartos para limpeza"
        />

        {groupedByFloor.length === 0 && (
          <div className="p-4 text-center text-slate-400 italic">
            {loading ? "Carregando..." : "Nenhum quarto pendente de limpeza no momento."}
          </div>
        )}

        {groupedByFloor.map(([floor, floorRooms]) => (
          <div key={floor} className="avoid-break">
            <div className="font-bold text-slate-900 bg-slate-100 px-2 py-1 border border-slate-900 mb-1">
              Andar: {floor}
            </div>
            <table className="w-full text-left border-collapse mb-2">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="p-1.5 w-32">Quarto</th>
                  <th className="p-1.5">Descrição quarto</th>
                </tr>
              </thead>
              <tbody>
                {floorRooms.map((room) => (
                  <tr key={room.id} className="border-b border-slate-300">
                    <td className="p-1.5 font-bold">{room.number}</td>
                    <td className="p-1.5">{room.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="font-bold pt-1">Qtd.Quartos Limpeza: {rooms.length}</div>
      </div>
    </div>
  );
}
