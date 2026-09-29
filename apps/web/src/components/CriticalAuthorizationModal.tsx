"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Loader2, AlertTriangle, KeyRound, XCircle, Clock, MessageCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

// Janela de autorização de evento crítico (desconto acima do limite, anulação de lançamento no
// caixa…). Aparece quando o servidor responde { precisaAutorizacao, autorizacao } — a ação ficou
// parada esperando. Opções: autorizar aqui (autorizador escolhe o nome e digita a senha), enviar
// para um autorizador (link único pelo WhatsApp, a janela fica aguardando a resposta) ou cancelar
// o evento (nada é autorizado e o operador volta para a tela anterior).
// Regras e fluxo completo: apps/web/src/lib/criticalAuth.ts.

export interface AutorizacaoPendente {
  id: string;
  evento: string;
  resumo: string;
  detalhes: Record<string, string>;
  expiraEm: string;
}

interface Autorizador {
  id: string;
  nome: string;
  temWhatsapp: boolean;
}

interface Props {
  autorizacao: AutorizacaoPendente;
  /** id da autorização aprovada, ou null se o evento foi cancelado. */
  onDone: (authorizationId: string | null) => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function CriticalAuthorizationModal({ autorizacao, onDone }: Props) {
  const { theme } = useTheme();
  const isDark = theme.isDark;

  const [autorizadores, setAutorizadores] = useState<Autorizador[] | null>(null);
  const [autorizadorId, setAutorizadorId] = useState("");
  const [senha, setSenha] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Envio pelo WhatsApp (Fase 2): para quem foi enviado, e a recusa, se vier.
  const [remoteId, setRemoteId] = useState("");
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [recusa, setRecusa] = useState<{ por: string | null; observacao: string | null } | null>(null);
  const finished = useRef(false);

  const expiresAt = useMemo(() => new Date(autorizacao.expiraEm).getTime(), [autorizacao.expiraEm]);
  const remaining = expiresAt - now;
  const expired = remaining <= 0;

  useEffect(() => {
    fetch("/api/autorizacoes/autorizadores")
      .then((r) => r.json())
      .then((d) => {
        const list: Autorizador[] = d.success ? d.autorizadores : [];
        setAutorizadores(list);
        if (list.length === 1) setAutorizadorId(list[0].id);
        const comWhatsapp = list.filter((a) => a.temWhatsapp);
        if (comWhatsapp.length === 1) setRemoteId(comWhatsapp[0].id);
      })
      .catch(() => setAutorizadores([]));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const finish = useCallback(
    (id: string | null) => {
      if (finished.current) return;
      finished.current = true;
      onDone(id);
    },
    [onDone]
  );

  // Enviado pelo WhatsApp: consulta só o status (resposta mínima) a cada 3 s enquanto a janela
  // está aberta, até o autorizador decidir, o prazo acabar ou a janela fechar.
  useEffect(() => {
    if (!enviadoPara || recusa || expired) return;
    const t = setInterval(async () => {
      try {
        const d = await fetch(`/api/autorizacoes/${autorizacao.id}`).then((r) => r.json());
        if (!d.success) return;
        if (d.status === "APROVADA") finish(autorizacao.id);
        else if (d.status === "RECUSADA") setRecusa({ por: d.decididoPor, observacao: d.observacao });
      } catch {
        // Falha pontual de rede: tenta de novo no próximo ciclo.
      }
    }, 3000);
    return () => clearInterval(t);
  }, [enviadoPara, recusa, expired, autorizacao.id, finish]);

  const handleSend = async () => {
    if (justificativa.trim().length < 3) return setError("Informe a justificativa do pedido.");
    if (!remoteId) return setError("Escolha para qual autorizador enviar.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/autorizacoes/${autorizacao.id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autorizadorId: remoteId, justificativa: justificativa.trim() }),
      });
      const data = await res.json();
      if (data.success) setEnviadoPara(data.enviadoPara);
      else setError(data.error || "Não foi possível enviar.");
    } catch {
      setError("Falha de comunicação ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await fetch(`/api/autorizacoes/${autorizacao.id}/cancelar`, { method: "POST" });
    } catch {
      // Mesmo sem resposta, nada foi autorizado: a solicitação expira sozinha.
    }
    finish(null);
  };

  const handleAuthorizeHere = async () => {
    if (justificativa.trim().length < 3) return setError("Informe a justificativa do pedido.");
    if (!autorizadorId) return setError("Escolha quem está autorizando.");
    if (!senha) return setError("Informe a senha do autorizador.");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/autorizacoes/${autorizacao.id}/local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autorizadorId, senha, justificativa: justificativa.trim() }),
      });
      const data = await res.json();
      setSenha("");
      if (data.success) {
        finish(autorizacao.id);
        return;
      }
      setError(data.error || "Não foi possível autorizar.");
    } catch {
      setError("Falha de comunicação ao tentar autorizar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const inputCls = `w-full rounded-md px-2.5 py-1.5 text-xs border outline-none ${
    isDark ? "bg-slate-950 border-slate-700 text-white focus:border-amber-400" : "bg-white border-slate-300 text-slate-900 focus:border-amber-500"
  }`;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="critical-auth-title"
        className={`w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl ${
          isDark ? "bg-[#0F172A] border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span id="critical-auth-title" className="text-sm font-bold">Autorização necessária</span>
          </div>
          <span className={`flex items-center gap-1 text-[11px] font-mono ${expired ? "text-red-500" : muted}`} title="Tempo restante para autorizar">
            <Clock className="w-3 h-3" /> {formatRemaining(remaining)}
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className={`flex items-start gap-2 text-[11px] p-2 rounded-lg border ${isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800"}`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{autorizacao.evento}</p>
              <p>{autorizacao.resumo}</p>
            </div>
          </div>

          {Object.keys(autorizacao.detalhes).length > 0 && (
            <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] rounded-lg border p-2 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              {Object.entries(autorizacao.detalhes).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className={muted}>{k}</dt>
                  <dd className="font-semibold text-right break-words">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}

          {recusa ? (
            <div role="alert" className={`text-[11px] p-2 rounded-lg border ${isDark ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-red-50 border-red-300 text-red-700"}`}>
              <p className="font-bold">Recusado{recusa.por ? ` por ${recusa.por}` : ""}.</p>
              {recusa.observacao && <p>{recusa.observacao}</p>}
              <p className="mt-1">Nada foi autorizado.</p>
            </div>
          ) : expired ? (
            <p className="text-[11px] text-red-500 font-semibold">
              O prazo para autorizar terminou. Cancele e refaça a operação para pedir uma nova autorização.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="critical-auth-just" className={`block text-[10px] font-semibold mb-0.5 ${muted}`}>
                  Justificativa do pedido
                </label>
                <textarea
                  id="critical-auth-just"
                  autoFocus
                  rows={2}
                  maxLength={500}
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className={`${inputCls} resize-none`}
                  placeholder="Por que esta operação é necessária?"
                />
              </div>

              <div className={`rounded-lg border p-3 space-y-2 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                <p className="text-[11px] font-bold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" /> Autorizar aqui
                </p>
                {autorizadores === null ? (
                  <p className={`text-[11px] ${muted}`}>Carregando autorizadores…</p>
                ) : autorizadores.length === 0 ? (
                  <p className="text-[11px] text-red-500">
                    Nenhum autorizador cadastrado. Peça ao administrador para marcar um usuário como “Autorizador” em Configurações › Usuários.
                  </p>
                ) : (
                  <>
                    <div>
                      <label htmlFor="critical-auth-who" className={`block text-[10px] font-semibold mb-0.5 ${muted}`}>
                        Autorizador
                      </label>
                      <select id="critical-auth-who" value={autorizadorId} onChange={(e) => setAutorizadorId(e.target.value)} className={inputCls}>
                        <option value="">Selecione…</option>
                        {autorizadores.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="critical-auth-pass" className={`block text-[10px] font-semibold mb-0.5 ${muted}`}>
                        Senha do autorizador
                      </label>
                      <input
                        id="critical-auth-pass"
                        type="password"
                        autoComplete="off"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !loading && handleAuthorizeHere()}
                        className={inputCls}
                        placeholder="••••••••"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAuthorizeHere}
                      disabled={loading}
                      className="w-full px-3.5 py-1.5 rounded-md text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Autorizar
                    </button>
                  </>
                )}
              </div>

              {autorizadores && autorizadores.length > 0 && (
                <div className={`rounded-lg border p-3 space-y-2 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <p className="text-[11px] font-bold flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> Enviar para um autorizador
                  </p>
                  {autorizadores.some((a) => a.temWhatsapp) ? (
                    <>
                      <div className="flex gap-2">
                        <select
                          aria-label="Autorizador que vai receber o pedido pelo WhatsApp"
                          value={remoteId}
                          onChange={(e) => setRemoteId(e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Selecione…</option>
                          {autorizadores.map((a) => (
                            <option key={a.id} value={a.id} disabled={!a.temWhatsapp}>
                              {a.nome}
                              {a.temWhatsapp ? "" : " (sem WhatsApp)"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSend}
                          disabled={sending}
                          className="shrink-0 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
                          {enviadoPara ? "Reenviar" : "Enviar"}
                        </button>
                      </div>
                      {enviadoPara && (
                        <p role="status" className={`text-[11px] flex items-center gap-1.5 ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                          <Loader2 className="w-3 h-3 animate-spin" /> Aguardando {enviadoPara} responder pelo WhatsApp…
                        </p>
                      )}
                      <p className={`text-[10px] ${muted}`}>O link vale só uma vez e até o fim do prazo. Reenviar invalida o link anterior.</p>
                    </>
                  ) : (
                    <p className={`text-[11px] ${muted}`}>
                      Nenhum autorizador tem WhatsApp cadastrado. Cadastre em Cadastros › Usuários para poder enviar.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-[11px] text-red-500 font-semibold">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleCancel}
            disabled={loading && !expired}
            className={`w-full px-3 py-1.5 rounded-md text-xs font-semibold border flex items-center justify-center gap-1.5 ${
              isDark ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            <XCircle className="w-3.5 h-3.5" /> {recusa ? "Fechar" : "Cancelar o evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook para as telas: `requestAuthorization(data.autorizacao)` abre a janela e resolve com o id
 * aprovado (reenviar a ação com `authorizationId`) ou null (evento cancelado). Renderize
 * `authorizationModal` em qualquer lugar da tela.
 */
export function useCriticalAuthorization() {
  const [pending, setPending] = useState<{ payload: AutorizacaoPendente; resolve: (id: string | null) => void } | null>(null);

  const requestAuthorization = useCallback(
    (payload: AutorizacaoPendente) => new Promise<string | null>((resolve) => setPending({ payload, resolve })),
    []
  );

  const authorizationModal = pending ? (
    <CriticalAuthorizationModal
      key={pending.payload.id}
      autorizacao={pending.payload}
      onDone={(id) => {
        pending.resolve(id);
        setPending(null);
      }}
    />
  ) : null;

  return { requestAuthorization, authorizationModal };
}

/**
 * Executa uma chamada que pode esbarrar em evento crítico: se o servidor pedir autorização, abre a
 * janela e, aprovada, repete a MESMA chamada com o authorizationId. Devolve `{ cancelado: true }`
 * quando o operador cancela o evento.
 */
export async function withCriticalAuthorization<T extends Record<string, any>>(
  call: (authorizationId?: string | string[]) => Promise<T>,
  requestAuthorization: (payload: AutorizacaoPendente) => Promise<string | null>
): Promise<T | { success: false; cancelado: true; error: string }> {
  let data = await call();
  // Uma mesma gravação pode exigir mais de um evento (ex.: check-in com desconto acima do limite
  // E cortesia de chegada antecipada): acumula os ids aprovados e reenvia todos — cada evento
  // consome só o seu no servidor. Até 4 rodadas (o servidor pede de novo se a ação mudou).
  const approved: string[] = [];
  for (let i = 0; i < 4 && data && !data.success && data.precisaAutorizacao && data.autorizacao; i++) {
    const id = await requestAuthorization(data.autorizacao as AutorizacaoPendente);
    if (!id) return { success: false, cancelado: true, error: "Operação cancelada: nada foi autorizado." };
    approved.push(id);
    data = await call(approved.length === 1 ? approved[0] : [...approved]);
  }
  return data;
}
