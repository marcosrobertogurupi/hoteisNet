"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Filter, CalendarClock } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";
import RelatorioPrintHeader from "@/components/relatorios/RelatorioPrintHeader";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface ReservaRow {
  id: string;
  roomNumber: string;
  guestName: string;
  guestPhone: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function ReservasPorPeriodoPage() {
  const { theme, hotelName: hotelNameTheme, hotelLogo, showLogoInPrint } = useTheme();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const [date, setDate] = useState(getTodayDateStr());
  const [appliedDate, setAppliedDate] = useState(getTodayDateStr());
  const [rows, setRows] = useState<ReservaRow[]>([]);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorios/reservas-por-periodo?tenantId=${tenantId}&date=${targetDate}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.reservations || []);
        setHotel(data.hotel || null);
        setAppliedDate(targetDate);
      }
    } catch (err) {
      console.error("Erro ao buscar reservas por período:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData(getTodayDateStr());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <CalendarClock className="w-5 h-5" style={{ color: theme.primaryColor }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Reservas por período</h1>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir relatório
        </button>
      </div>

      {/* Filter Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-end gap-3 print:hidden ${theme.bgCard}`}>
        <div className="w-52">
          <CustomDatePicker
            label="Data da previsão de chegada"
            value={date}
            onChange={setDate}
            isDark={theme.isDark}
            type="date"
          />
        </div>
        <button
          onClick={() => fetchData(date)}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Filtrando..." : "Filtrar"}
        </button>
      </div>

      {/* Printable Document */}
      <div className="p-6 rounded-2xl bg-white text-slate-900 font-mono text-xs space-y-3 print:p-0 print:rounded-none print-container">
        <RelatorioPrintHeader
          hotelName={hotelDisplayName}
          hotelCnpj={hotel?.cnpj}
          hotelAddress={hotel?.addressLine}
          hotelLogo={hotelLogo}
          showLogo={showLogoInPrint}
          title={`Reservas por período — chegada em ${fmtDate(appliedDate + "T12:00:00Z")}`}
        />

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="p-1.5">Quarto</th>
              <th className="p-1.5">Hóspede</th>
              <th className="p-1.5">Telefone</th>
              <th className="p-1.5">Dt.Chegada</th>
              <th className="p-1.5">Dt.Saída</th>
              <th className="p-1.5 text-center">Qtd Diárias</th>
              <th className="p-1.5 text-center">Qtd Adultos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-300 avoid-break">
                <td className="p-1.5 font-bold">{r.roomNumber}</td>
                <td className="p-1.5">{r.guestName}</td>
                <td className="p-1.5">{r.guestPhone || "-"}</td>
                <td className="p-1.5">{fmtDateTime(r.checkInDate)}</td>
                <td className="p-1.5">{fmtDate(r.checkOutDate)}</td>
                <td className="p-1.5 text-center">{r.nights}</td>
                <td className="p-1.5 text-center">{r.adults}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                  {loading ? "Carregando..." : "Nenhuma reserva com chegada prevista nesta data."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="font-bold pt-1">Qtd.Reservas: {rows.length}</div>
      </div>
    </div>
  );
}
