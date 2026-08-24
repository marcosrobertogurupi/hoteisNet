"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Filter, LogOut, Eye } from "lucide-react";
import CustomDatePicker from "@/components/CustomDatePicker";
import { ConsultaCheckoutAcoesModal } from "@/components/ConsultaCheckoutAcoesModal";
import { useTheme } from "@/context/ThemeContext";
import { useSession } from "@/context/SessionContext";

interface CheckoutRow {
  stayId: string;
  roomNumber: string;
  guestName: string;
  guestPhone: string;
  checkInDate: string;
  expectedCheckOut: string;
  actualCheckOut: string;
  totalDaily: number;
  totalConsumption: number;
  otherDebits: number;
  discount: number;
  balanceDue: number;
  closingOperatorName: string;
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

// Estado inicial do filtro: hoje das 07:00 às 11:00 (janela típica de check-out matinal).
function getDefaultRange(): { from: string; to: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return { from: `${today}T07:00`, to: `${today}T11:00` };
}

export default function ConsultaCheckoutsPage() {
  const { theme } = useTheme();
  const { user } = useSession();
  const tenantId = user?.tenantId || "tenant-hoteisnet-demo";

  const defaultRange = getDefaultRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [rows, setRows] = useState<CheckoutRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/relatorios/consulta-checkouts?tenantId=${tenantId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const data = await res.json();
      if (data.success) {
        setRows(data.checkouts || []);
      }
      setSearched(true);
    } catch (err) {
      console.error("Erro ao buscar check-outs por período:", err);
    } finally {
      setLoading(false);
    }
  }, [from, to, tenantId]);

  return (
    <>
    {/* print:hidden porque o ImprimirResumoHospedagemModal (dentro de ConsultaCheckoutAcoesModal,
        renderizado fora deste bloco) monta seu próprio layout print:static — se este bloco não
        ficasse oculto, os dois apareceriam sobrepostos na impressão/PDF. */}
    <div className="space-y-4 print:hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/app/relatorios"
            className={`p-2 rounded-lg border transition-colors ${theme.bgCard}`}
            title="Voltar aos Relatórios"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <LogOut className="w-5 h-5" style={{ color: theme.primaryColor }} />
            <h1 className={`text-lg font-bold ${theme.textMain}`}>Consulta de Check-outs</h1>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-end gap-3 ${theme.bgCard}`}>
        <div className="w-56">
          <CustomDatePicker label="Check-out de" value={from} onChange={setFrom} isDark={theme.isDark} type="datetime-local" />
        </div>
        <div className="w-56">
          <CustomDatePicker label="Check-out até" value={to} onChange={setTo} isDark={theme.isDark} type="datetime-local" />
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Filter className="w-3.5 h-3.5" /> {loading ? "Buscando..." : "Pesquisar"}
        </button>
      </div>

      {/* Results Table */}
      <div className={`rounded-2xl border overflow-hidden ${theme.bgCard}`}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className={`border-b ${theme.isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50"}`}>
              <th className="p-2.5">Quarto</th>
              <th className="p-2.5">Hóspede</th>
              <th className="p-2.5">Telefone</th>
              <th className="p-2.5">Dt.Chegada</th>
              <th className="p-2.5">Dt.Check-out</th>
              <th className="p-2.5 text-right">Total Despesas</th>
              <th className="p-2.5 text-right">Saldo</th>
              <th className="p-2.5">Operador</th>
              <th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const totalDespesas = r.totalDaily + r.totalConsumption + r.otherDebits;
              return (
                <tr
                  key={r.stayId}
                  onClick={() => setSelectedStayId(r.stayId)}
                  className={`border-b cursor-pointer transition-colors ${
                    theme.isDark ? "border-slate-800 hover:bg-slate-800/60" : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <td className="p-2.5 font-bold">{r.roomNumber}</td>
                  <td className="p-2.5">{r.guestName}</td>
                  <td className="p-2.5">{r.guestPhone || "-"}</td>
                  <td className="p-2.5">{fmtDateTime(r.checkInDate)}</td>
                  <td className="p-2.5 font-semibold">{fmtDateTime(r.actualCheckOut)}</td>
                  <td className="p-2.5 text-right font-mono">R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2.5 text-right font-mono">R$ {r.balanceDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2.5">{r.closingOperatorName || "-"}</td>
                  <td className="p-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStayId(r.stayId);
                      }}
                      className={`p-1.5 rounded-lg border flex items-center gap-1 text-[11px] font-semibold ${theme.isDark ? "border-slate-700 hover:bg-slate-700" : "border-slate-300 hover:bg-slate-100"}`}
                      title="Ver dados / imprimir / enviar"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className={`p-6 text-center italic ${theme.textMuted}`}>
                  {loading
                    ? "Carregando..."
                    : searched
                      ? "Nenhum check-out encontrado no período informado."
                      : "Informe o período e clique em Pesquisar."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className={`px-2.5 py-2 text-[11px] font-semibold border-t ${theme.isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-500"}`}>
            {rows.length} check-out{rows.length !== 1 ? "s" : ""} encontrado{rows.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>

    {selectedStayId && (
      <ConsultaCheckoutAcoesModal isOpen={!!selectedStayId} onClose={() => setSelectedStayId(null)} stayId={selectedStayId} />
    )}
    </>
  );
}
