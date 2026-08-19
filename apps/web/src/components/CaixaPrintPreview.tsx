"use client";

import { useMemo } from "react";

export interface CashTransactionDTO {
  id: string;
  type: string;
  amount: number;
  description: string;
  paymentMethod: string;
  guestName: string | null;
  roomNumber: string | null;
  createdAt: string;
  accountPlanCode?: string | null;
  accountPlanDescription?: string | null;
}

export interface CashRegisterDTO {
  id: string;
  caixaNumero: number;
  operatorId: string;
  operatorName: string;
  openingBalance: number;
  openedAt: string;
  closedAt: string | null;
  totalDinheiro: number;
  totalPix: number;
  totalCartao: number;
  totalSangrias: number;
  saldoTotal: number;
  transactions: CashTransactionDTO[];
}

const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Relatório impresso do caixa, no padrão do sistema WinDev original (impressão do caixa.pdf):
// abertura sempre como primeira linha, cada movimento como Crédito ou Débito. Compartilhado entre
// a tela de caixa do próprio operador e a tela "Caixa Geral" do admin, que imprime o caixa de
// qualquer operador.
export default function CaixaPrintPreview({ caixa, hotelName }: { caixa: CashRegisterDTO; hotelName?: string }) {
  const printRows = useMemo(() => {
    const rows: { dataHora: string; descricao: string; credito: number; debito: number; planoContas: string }[] = [];
    const abertura = caixa.transactions.find((t) => t.type === "SUPRIMENTO");
    rows.push({
      dataHora: abertura ? abertura.createdAt : caixa.openedAt,
      descricao: "Abertura do caixa",
      credito: abertura ? abertura.amount : caixa.openingBalance,
      debito: 0,
      planoContas: "—",
    });
    for (const t of caixa.transactions) {
      if (t.type === "SUPRIMENTO") continue;
      rows.push({
        dataHora: t.createdAt,
        descricao: t.description,
        credito: t.type === "ENTRADA" ? t.amount : 0,
        debito: t.type === "SANGRIA" ? t.amount : 0,
        planoContas: t.accountPlanCode
          ? `${t.accountPlanCode} - ${t.accountPlanDescription}`
          : t.type === "SANGRIA"
            ? "Não informado"
            : "—",
      });
    }
    return rows;
  }, [caixa]);

  // Totais por forma de pagamento (apenas entradas reais, sem contar fundo de troco), somados
  // ao final do relatório — equivalente ao rodapé "CARTAO / PIX / TOTAL CAIXA" do WinDev.
  const printTotalsByMethod = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of caixa.transactions) {
      if (t.type !== "ENTRADA") continue;
      totals.set(t.paymentMethod, (totals.get(t.paymentMethod) || 0) + t.amount);
    }
    return Array.from(totals.entries());
  }, [caixa]);

  const printTotalCaixa = printTotalsByMethod.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="fixed inset-0 bg-white text-black z-[100] p-6 overflow-y-auto print-container print:block hidden font-mono text-xs">
      <style>{`@media print { @page { size: landscape; } }`}</style>
      <div className="pb-1">
        <h1 className="text-base font-bold uppercase tracking-tight">{hotelName || "HOTEL IDEAL"} - 40.904.811/0001-31</h1>
        <p className="text-[11px] text-slate-700">RUA MARECHAL RONDON, SN - ALTO PARANA - REDENCAO - PA CEP: 68550303 - (063) 3415-4614</p>
        <div className="h-1.5 bg-black w-full mt-2 mb-3"></div>
      </div>

      <div className="flex items-center justify-between text-xs mb-1">
        <span><strong>No.Caixa:</strong> {caixa.caixaNumero}</span>
        <span><strong>Página:</strong> 1</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 text-xs mb-3">
        <span><strong>Operador:</strong> {caixa.operatorName}</span>
        <span><strong>Data Abertura:</strong> {fmtDataHora(caixa.openedAt)}</span>
        <span><strong>Data fechamento:</strong> {caixa.closedAt ? fmtDataHora(caixa.closedAt) : "__/__/____ HH:mm:SS"}</span>
      </div>

      <table className="w-full text-left border-collapse text-[11px]">
        <thead>
          <tr className="border-y border-black font-bold">
            <th className="py-1 pr-2">Data/Hora</th>
            <th className="py-1 pr-2">Descrição</th>
            <th className="py-1 pr-2 text-right">Crédito(R$)</th>
            <th className="py-1 pr-2 text-right">Débito(R$)</th>
            <th className="py-1">Plano de contas</th>
          </tr>
        </thead>
        <tbody>
          {printRows.map((row, idx) => (
            <tr key={idx} className="border-b border-slate-300">
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDataHora(row.dataHora)}</td>
              <td className="py-1 pr-2">{row.descricao}</td>
              <td className="py-1 pr-2 text-right">{fmtBRL(row.credito)}</td>
              <td className="py-1 pr-2 text-right">{fmtBRL(row.debito)}</td>
              <td className="py-1">{row.planoContas}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1 text-xs max-w-xs">
        {printTotalsByMethod.map(([method, total]) => (
          <div key={method} className="flex justify-between font-semibold">
            <span>{method}</span>
            <span>{fmtBRL(total)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold pt-1 border-t border-black">
          <span>TOTAL CAIXA:</span>
          <span>{fmtBRL(printTotalCaixa)}</span>
        </div>
      </div>
    </div>
  );
}
