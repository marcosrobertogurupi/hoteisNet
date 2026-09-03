"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { Modal, money, ghostBtn } from "../_ui";

interface Turno {
  data: string;
  escopo: string;
  comandasFechadas: number;
  comandasAbertas: number;
  totalFechado: number;
  naContaQuarto: number;
  adiantamentosRecebidos: number;
  porFormaPagamento: Array<{ forma: string; rotulo: string; valor: number }>;
  porPontoVenda: Array<{ nome: string; qtd: number; total: number }>;
  porStatusFiscal: Record<string, number>;
}

const FISCAL_LABEL: Record<string, string> = {
  ABERTA: "Abertas",
  AGUARDANDO_FISCAL: "Aguardando cupom",
  FISCAL_AUTORIZADA: "Cupom emitido",
  FISCAL_REJEITADA: "Cupom rejeitado",
};

export default function TurnoModal({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const [turno, setTurno] = useState<Turno | null>(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    fetch(`/api/pdv/turno${todos ? "?todos=1" : ""}`)
      .then((r) => r.json())
      .then((d) => d?.success && setTurno(d.turno));
  }, [todos]);

  const linha = (label: string, value: string, bold?: boolean) => (
    <div className={`flex justify-between text-xs ${bold ? "font-bold" : ""}`}>
      <span className={isDark ? "text-slate-400" : "text-slate-500"}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );

  return (
    <Modal isDark={isDark} title="Resumo do turno" onClose={onClose}>
      <div className="flex gap-2">
        {(["MEU", "TODOS"] as const).map((e) => (
          <button
            key={e}
            onClick={() => setTodos(e === "TODOS")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
              (e === "TODOS") === todos ? "bg-sky-600 text-white border-sky-600" : isDark ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
            }`}
          >
            {e === "MEU" ? "Meu caixa" : "Todos os operadores"}
          </button>
        ))}
      </div>

      {!turno ? (
        <p className={`text-sm text-center py-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Carregando…</p>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-xl p-3 space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
            {linha("Comandas fechadas", String(turno.comandasFechadas))}
            {linha("Comandas ainda abertas", String(turno.comandasAbertas))}
            {linha("Total faturado", money(turno.totalFechado), true)}
            {turno.naContaQuarto > 0 && linha("→ na conta do quarto", money(turno.naContaQuarto))}
            {turno.adiantamentosRecebidos > 0 && linha("Adiantamentos recebidos", money(turno.adiantamentosRecebidos))}
          </div>

          {turno.porFormaPagamento.length > 0 && (
            <div>
              <div className={`text-[11px] font-mono uppercase mb-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Por forma de pagamento</div>
              <div className={`rounded-xl p-3 space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
                {turno.porFormaPagamento.map((f) => linha(f.rotulo, money(f.valor)))}
              </div>
            </div>
          )}

          {turno.porPontoVenda.length > 0 && (
            <div>
              <div className={`text-[11px] font-mono uppercase mb-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Por ponto de venda</div>
              <div className={`rounded-xl p-3 space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
                {turno.porPontoVenda.map((p) => linha(`${p.nome} (${p.qtd})`, money(p.total)))}
              </div>
            </div>
          )}

          {Object.keys(turno.porStatusFiscal).length > 0 && (
            <div>
              <div className={`text-[11px] font-mono uppercase mb-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>Situação fiscal das comandas</div>
              <div className={`rounded-xl p-3 space-y-1 ${isDark ? "bg-slate-950/60" : "bg-slate-50"}`}>
                {Object.entries(turno.porStatusFiscal).map(([k, v]) => linha(FISCAL_LABEL[k] || k, String(v)))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <a href="/app/cash-register" className={ghostBtn(isDark)}>
              Abrir o fechamento de caixa
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
