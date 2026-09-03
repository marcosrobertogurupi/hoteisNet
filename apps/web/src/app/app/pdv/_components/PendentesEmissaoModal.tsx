"use client";

import { useCallback, useEffect, useState } from "react";
import { Receipt, AlertTriangle, Loader2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { Modal, money, primaryBtn, ghostBtn, StatusPill } from "../_ui";

interface Pendente {
  atendimentoId: string;
  comanda: string;
  caixa: string;
  cliente: string;
  total: number;
  status: string;
  horasEspera: number;
  vencida: boolean;
  documento: { id: string; status: string; numero: number; serie: number; motivoRejeicao: string | null; emFila: boolean } | null;
}

export default function PendentesEmissaoModal({
  onClose,
  onEmitir,
}: {
  onClose: () => void;
  onEmitir: (atendimentoId: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [itens, setItens] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pdv/pendentes-emissao");
      const data = await res.json();
      if (data?.success) setItens(data.itens);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const emitir = async (id: string) => {
    setBusy(id);
    try {
      await onEmitir(id);
      await sync();
    } finally {
      setBusy(null);
    }
  };

  const vencidas = itens.filter((i) => i.vencida).length;

  return (
    <Modal isDark={isDark} title="Documentos pendentes de emissão" onClose={onClose} wide>
      <div className="flex items-center justify-between text-xs">
        <span className={isDark ? "text-slate-400" : "text-slate-500"}>
          {itens.length} comanda(s) fechada(s) sem cupom autorizado.
          {vencidas > 0 && <strong className="text-rose-500"> {vencidas} com mais de 24 h.</strong>}
        </span>
        <button onClick={sync} className={ghostBtn(isDark)}>
          Atualizar
        </button>
      </div>

      {loading ? (
        <p className={`text-sm text-center py-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <Loader2 className="w-4 h-4 animate-spin inline" /> Carregando…
        </p>
      ) : itens.length === 0 ? (
        <p className={`text-sm text-center py-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Nada pendente.</p>
      ) : (
        <div className={`rounded-xl border divide-y ${isDark ? "border-slate-800 divide-slate-800" : "border-slate-200 divide-slate-200"}`}>
          {itens.map((it) => (
            <div key={it.atendimentoId} className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold flex items-center gap-2">
                  Comanda {it.comanda}
                  <StatusPill status={it.status} />
                  {it.vencida && (
                    <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" /> {it.horasEspera}h — vencida
                    </span>
                  )}
                </div>
                <div className={isDark ? "text-slate-400" : "text-slate-500"}>
                  {it.caixa} · {it.cliente} · {money(it.total)}
                  {it.documento?.motivoRejeicao ? ` · rejeição: ${it.documento.motivoRejeicao}` : ""}
                </div>
              </div>
              {it.documento?.emFila ? (
                <span className="text-amber-500 font-semibold inline-flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> na fila do agente
                </span>
              ) : (
                <button onClick={() => emitir(it.atendimentoId)} disabled={busy === it.atendimentoId} className={primaryBtn}>
                  <Receipt className="w-4 h-4" />
                  {busy === it.atendimentoId ? "…" : it.status === "FISCAL_REJEITADA" ? "Reemitir" : "Emitir"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
