"use client";

import { use, useEffect, useState } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";
import { money, FORMA_LABEL, type Atendimento } from "../../_ui";

// Pré-conta / conferência — NÃO é documento fiscal. Layout enxuto para imprimir na térmica
// (window.print) enquanto a NFC-e não sai. Equivalente ao "Imprimir Conta" do PDV legado.
// A "folha" (coluna central) é sempre branca porque representa o papel térmico; o resto da
// tela segue o tema escolhido pelo assinante em Configurações.
export default function ConferenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const [a, setA] = useState<Atendimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pdv/atendimentos/${id}`)
      .then((r) => r.json())
      .then((d) => (d?.success ? setA(d.atendimento) : setErro(d?.error || "Comanda não encontrada.")));
  }, [id]);

  if (erro) return <div className={`p-8 text-sm text-red-600 ${theme.bgApp} min-h-screen`}>{erro}</div>;
  if (!a)
    return (
      <div className={`p-8 text-sm ${isDark ? "text-slate-400" : "text-slate-500"} ${theme.bgApp} min-h-screen`}>Carregando…</div>
    );

  const itens = a.itens.filter((i) => !i.cancelado);

  return (
    <div className={`${theme.bgApp} ${theme.textMain} min-h-screen`}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 6mm; }
          html, body { background: #fff !important; }
          .conf-sheet { color: #000 !important; }
        }
      `}</style>

      <div
        className={`no-print flex items-center justify-between gap-3 p-3 border-b ${
          isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50"
        }`}
      >
        <Link
          href="/app/pdv"
          className={`text-xs font-semibold inline-flex items-center gap-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao PDV
        </Link>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold inline-flex items-center gap-2"
        >
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      <div className="conf-sheet mx-auto my-4 max-w-[320px] bg-white text-black rounded-md shadow-lg px-3 py-4 font-mono text-[12px] leading-snug">
        <div className="text-center">
          <div className="font-bold text-[13px]">CONFERÊNCIA DE CONSUMO</div>
          <div className="text-[10px]">NÃO É DOCUMENTO FISCAL</div>
        </div>
        <hr className="my-2 border-black border-dashed" />

        <div>Comanda: <b>{a.comanda.number}</b>{a.mesa ? `  ·  Mesa ${a.mesa.numero}` : ""}</div>
        <div>
          {a.tipoCliente === "HOSPEDE"
            ? `Quarto ${a.hospedagem?.quarto ?? "—"} — ${a.hospedagem?.hospede ?? ""}`
            : a.nomeCliente || "Passante"}
        </div>
        {a.pontoVenda && <div>{a.pontoVenda.nome}</div>}
        <div>Operador: {a.operador.nome}</div>
        <div>{new Date().toLocaleString("pt-BR")}</div>

        <hr className="my-2 border-black border-dashed" />

        {itens.map((i) => (
          <div key={i.id} className="mb-1">
            <div className="flex justify-between">
              <span>{i.quantidade}x {i.nome}</span>
              <span>{money(i.total)}</span>
            </div>
            {i.observacao && <div className="text-[10px] pl-3">» {i.observacao}</div>}
          </div>
        ))}

        <hr className="my-2 border-black border-dashed" />

        <div className="flex justify-between"><span>Subtotal</span><span>{money(a.subtotal)}</span></div>
        {a.desconto > 0 && <div className="flex justify-between"><span>Desconto</span><span>- {money(a.desconto)}</span></div>}
        <div className="flex justify-between font-bold text-[13px]"><span>TOTAL</span><span>{money(a.total)}</span></div>

        {a.pagamentos.length > 0 && (
          <>
            <hr className="my-2 border-black border-dashed" />
            {a.pagamentos.map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.tipo === "ADVANCE" ? "Parcial" : "Pago"} {FORMA_LABEL[p.forma] || p.forma}</span>
                <span>{money(p.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold"><span>SALDO</span><span>{money(a.saldo)}</span></div>
          </>
        )}

        <hr className="my-2 border-black border-dashed" />
        <div className="text-center text-[10px]">Confira os itens. O cupom fiscal (NFC-e) é emitido no fechamento.</div>
      </div>
    </div>
  );
}
