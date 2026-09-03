"use client";

import { X } from "lucide-react";

// Helpers de estilo do PDV do restaurante — mesmo padrão condicional a theme.isDark do resto
// do projeto (respeita o tema escolhido em Configurações).

export const money = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const inputCls = (isDark: boolean) =>
  `w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition ${
    isDark
      ? "bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-sky-500"
      : "bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-sky-600"
  }`;

export const labelCls = (isDark: boolean) => `text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`;

export const cardCls = (isDark: boolean) =>
  `border rounded-2xl ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`;

export const primaryBtn =
  "px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-50";

export const successBtn =
  "px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50";

export const ghostBtn = (isDark: boolean) =>
  `px-4 py-2.5 rounded-xl border text-xs font-semibold transition ${
    isDark ? "border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
  }`;

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ABERTA: { label: "Aberta", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  AGUARDANDO_FISCAL: { label: "Aguardando cupom", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  FISCAL_AUTORIZADA: { label: "Cupom emitido", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  FISCAL_REJEITADA: { label: "Cupom rejeitado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  CANCELADA: { label: "Cancelada", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.cls}`}>{s.label}</span>;
}

export function Modal({
  isDark,
  title,
  onClose,
  children,
  wide,
}: {
  isDark: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[9000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`border rounded-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} shadow-2xl overflow-hidden ${
          isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <h2 className="text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// Tipos do payload serializado das rotas /api/pdv/atendimentos.
export interface Atendimento {
  id: string;
  status: string;
  tipoCliente: "PASSANTE" | "HOSPEDE";
  cpfNota: string | null;
  nomeCliente: string | null;
  operador: { id: string; nome: string };
  comanda: { id: string; number: string };
  caixa: { id: string; name: string };
  mesa: { id: string; numero: string } | null;
  pontoVenda: { id: string; nome: string } | null;
  hospedagem: { id: string; quarto: string | null; hospede: string | null } | null;
  subtotal: number;
  desconto: number;
  total: number;
  pago: number;
  saldo: number;
  abertaEm: string;
  fechadaEm: string | null;
  telefoneCliente?: string | null;
  descontoLiberadoPor?: string | null;
  itens: Array<{
    id: string;
    dishId: string | null;
    productId: string | null;
    nome: string;
    observacao: string | null;
    precoUnitario: number;
    quantidade: number;
    desconto: number;
    total: number;
    cancelado: boolean;
    motivoCancelamento: string | null;
    canceladoPor: string | null;
  }>;
  pagamentos: Array<{
    id: string;
    tipo: "ADVANCE" | "SETTLEMENT";
    forma: string;
    valor: number;
    troco: number;
    bandeira: string | null;
    nsu: string | null;
    em: string;
  }>;
  documentosFiscais: Array<{ id: string; modelo: string; status: string; numero: number; serie: number; chave: string | null; motivoRejeicao: string | null }>;
}

export const FORMA_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  DEBITO: "Cartão débito",
  CREDITO: "Cartão crédito",
  PIX: "PIX",
  CONTA_QUARTO: "Conta do quarto",
};
