"use client";

import { useEffect, useState, use } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";

// Página PÚBLICA aberta pelo autorizador no celular, a partir do link recebido pelo WhatsApp
// (Fase 2 da autorização de eventos críticos — ver apps/web/src/lib/criticalAuth.ts). Mostra tudo
// o que está sendo autorizado e deixa aprovar ou recusar UMA vez. Toda a validação (token, prazo,
// uso único, autorizador) é feita em /api/public/autorizacao/[token].

interface Autorizacao {
  evento: string;
  resumo: string;
  detalhes: Record<string, string>;
  justificativa: string | null;
  pedidoPor: string;
  terminal: string | null;
  pedidoEm: string;
  expiraEm: string;
  autorizador: string | null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function AutorizarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hotel, setHotel] = useState<{ nome: string; logoUrl: string | null } | null>(null);
  const [aut, setAut] = useState<Autorizacao | null>(null);
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState<"APROVAR" | "RECUSAR" | null>(null);
  const [done, setDone] = useState<"APROVAR" | "RECUSAR" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch(`/api/public/autorizacao/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) setErrorMsg(data.error || "Link inválido.");
        else {
          setHotel(data.hotel);
          setAut(data.autorizacao);
        }
      })
      .catch(() => setErrorMsg("Não foi possível carregar esta página. Tente novamente."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = aut ? new Date(aut.expiraEm).getTime() - now : 0;
  const expired = !!aut && remaining <= 0;

  const decide = async (decisao: "APROVAR" | "RECUSAR") => {
    setSubmitting(decisao);
    try {
      const res = await fetch(`/api/public/autorizacao/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, observacao }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Não foi possível registrar a decisão.");
        return;
      }
      setDone(decisao);
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-4">
        {loading && <p className="text-sm text-slate-500 text-center">Carregando...</p>}

        {!loading && errorMsg && !done && (
          <div className="text-center space-y-3 py-4">
            <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="text-sm text-slate-700">{errorMsg}</p>
          </div>
        )}

        {!loading && done && (
          <div className="text-center space-y-3 py-4">
            {done === "APROVAR" ? (
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            ) : (
              <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
            )}
            <h1 className="text-lg font-bold text-slate-900">{done === "APROVAR" ? "Autorizado" : "Recusado"}</h1>
            <p className="text-sm text-slate-600">
              {done === "APROVAR"
                ? "A autorização foi registrada. O sistema do hotel já pode concluir a operação."
                : "A recusa foi registrada. Nada foi autorizado."}
            </p>
            <p className="text-[11px] text-slate-400">Este link não pode ser usado de novo.</p>
          </div>
        )}

        {!loading && !errorMsg && !done && aut && hotel && (
          <>
            <div className="flex items-center justify-between">
              {hotel.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hotel.logoUrl} alt={hotel.nome} className="h-9 object-contain" />
              ) : (
                <p className="text-sm font-bold text-slate-600">{hotel.nome}</p>
              )}
              <span className={`flex items-center gap-1 text-xs font-mono ${expired ? "text-rose-500" : "text-slate-500"}`}>
                <Clock className="w-3.5 h-3.5" /> {formatRemaining(remaining)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <h1 className="text-base font-bold text-slate-900">Autorização solicitada</h1>
            </div>

            <div className="flex items-start gap-2 text-xs p-3 rounded-xl border bg-amber-50 border-amber-300 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{aut.evento}</p>
                <p>{aut.resumo}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs rounded-xl border border-slate-200 p-3">
              {Object.entries(aut.detalhes).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold text-slate-900 text-right break-words">{v}</dd>
                </div>
              ))}
              <dt className="text-slate-500">Pedido por</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {aut.pedidoPor}
                {aut.terminal ? ` (${aut.terminal})` : ""}
              </dd>
              <dt className="text-slate-500">Pedido em</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {new Date(aut.pedidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </dd>
            </dl>

            {aut.justificativa && (
              <div className="text-xs rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-slate-500 mb-0.5">Justificativa do operador</p>
                <p className="text-slate-900">{aut.justificativa}</p>
              </div>
            )}

            {expired ? (
              <p className="text-sm text-rose-600 font-semibold text-center">O prazo para esta autorização terminou.</p>
            ) : (
              <>
                <div>
                  <label htmlFor="obs" className="block text-xs font-semibold text-slate-600 mb-1">
                    Observação (opcional — aparece para o operador se você recusar)
                  </label>
                  <textarea
                    id="obs"
                    rows={2}
                    maxLength={500}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500 resize-none"
                  />
                </div>
                {aut.autorizador && (
                  <p className="text-[11px] text-slate-500 text-center">
                    A decisão será registrada em nome de <strong>{aut.autorizador}</strong>.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => decide("RECUSAR")}
                    disabled={!!submitting}
                    className="py-3 rounded-xl font-bold text-sm border-2 border-rose-500 text-rose-600 hover:bg-rose-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {submitting === "RECUSAR" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Recusar
                  </button>
                  <button
                    onClick={() => decide("APROVAR")}
                    disabled={!!submitting}
                    className="py-3 rounded-xl font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {submitting === "APROVAR" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Aprovar
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
