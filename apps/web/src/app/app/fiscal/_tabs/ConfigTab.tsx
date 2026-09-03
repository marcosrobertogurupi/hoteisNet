"use client";

import { useEffect, useState } from "react";
import { Save, ShieldCheck, AlertTriangle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { inputCls, labelCls, cardCls, primaryBtn, regimeLabel } from "../_lib";

interface FiscalConfig {
  environment: "HOMOLOGACAO" | "PRODUCAO";
  nfceCscId: string | null;
  nfceCsc: string | null;
  defaultNfceSeries: number;
  defaultNfeSeries: number;
  additionalInfo: string | null;
  certificateExpiresAt: string | null;
  certificateHolder: string | null;
}
interface TenantCtx {
  taxRegime: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  razaoSocial: string | null;
}

export default function ConfigTab() {
  const { theme } = useTheme();
  const isDark = theme.isDark;
  const toast = useToast();

  const [tenant, setTenant] = useState<TenantCtx | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ambiente: "HOMOLOGACAO",
    cscId: "",
    csc: "",
    serieNfcePadrao: "1",
    serieNfePadrao: "1",
    informacoesComplementares: "",
  });
  const [certInfo, setCertInfo] = useState<{ expiresAt: string | null; holder: string | null }>({
    expiresAt: null,
    holder: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pdv/config");
        const data = await res.json();
        if (data?.success) {
          setTenant(data.tenant);
          const c: FiscalConfig | null = data.config;
          if (c) {
            setForm({
              ambiente: c.environment,
              cscId: c.nfceCscId || "",
              csc: c.nfceCsc || "",
              serieNfcePadrao: String(c.defaultNfceSeries),
              serieNfePadrao: String(c.defaultNfeSeries),
              informacoesComplementares: c.additionalInfo || "",
            });
            setCertInfo({ expiresAt: c.certificateExpiresAt, holder: c.certificateHolder });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/pdv/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Não foi possível salvar a configuração fiscal.");
        return;
      }
      toast.success("Configuração fiscal salva.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Carregando…</p>;

  const regimeOk = !!tenant?.taxRegime;

  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      {/* Contexto vindo do cadastro do hotel (só leitura) */}
      <div className={`${cardCls(isDark)} p-5`}>
        <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>Dados do emitente</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <Info label="Razão social" value={tenant?.razaoSocial} isDark={isDark} />
          <Info label="CNPJ" value={tenant?.cnpj} isDark={isDark} />
          <Info label="Inscrição estadual" value={tenant?.stateRegistration} isDark={isDark} />
          <Info
            label="Regime tributário"
            value={tenant?.taxRegime ? regimeLabel[tenant.taxRegime] ?? tenant.taxRegime : null}
            isDark={isDark}
          />
        </div>
        <p className={`mt-3 text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>
          Esses dados são editados em <strong>Configurações → Dados do Hotel</strong>.
        </p>
        {!regimeOk && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              O regime tributário do hotel não está preenchido. A emissão fiscal depende dele para escolher entre CST e
              CSOSN.
            </span>
          </div>
        )}
      </div>

      <div className={`${cardCls(isDark)} p-5 space-y-4`}>
        <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Emissão de NFC-e / NF-e</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Ambiente</label>
            <select
              value={form.ambiente}
              onChange={(e) => setForm({ ...form, ambiente: e.target.value })}
              className={inputCls(isDark)}
            >
              <option value="HOMOLOGACAO">Homologação (testes)</option>
              <option value="PRODUCAO">Produção</option>
            </select>
          </div>
          <div />
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>ID do Token do CSC (NFC-e)</label>
            <input
              value={form.cscId}
              onChange={(e) => setForm({ ...form, cscId: e.target.value })}
              placeholder="ex: 000001"
              className={inputCls(isDark)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Código do CSC (NFC-e)</label>
            <input
              value={form.csc}
              onChange={(e) => setForm({ ...form, csc: e.target.value })}
              placeholder="sequência fornecida pela SEFAZ-TO"
              className={inputCls(isDark)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Série padrão NFC-e</label>
            <input
              type="number"
              min={1}
              value={form.serieNfcePadrao}
              onChange={(e) => setForm({ ...form, serieNfcePadrao: e.target.value })}
              className={inputCls(isDark)}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls(isDark)}>Série padrão NF-e</label>
            <input
              type="number"
              min={1}
              value={form.serieNfePadrao}
              onChange={(e) => setForm({ ...form, serieNfePadrao: e.target.value })}
              className={inputCls(isDark)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls(isDark)}>Informações complementares (fixas em toda nota)</label>
          <textarea
            rows={2}
            value={form.informacoesComplementares}
            onChange={(e) => setForm({ ...form, informacoesComplementares: e.target.value })}
            placeholder="ex.: aviso de tributos incidentes (Lei 12.741/2012)"
            className={inputCls(isDark)}
          />
        </div>

        <div className={`flex items-center gap-2 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          {certInfo.holder ? (
            <span>
              Certificado A1 do caixa: <strong>{certInfo.holder}</strong>
              {certInfo.expiresAt ? ` — válido até ${new Date(certInfo.expiresAt).toLocaleDateString("pt-BR")}` : ""}
            </span>
          ) : (
            <span>O certificado A1 é instalado na máquina de cada caixa, nunca aqui.</span>
          )}
        </div>
      </div>

      <button type="submit" disabled={saving} className={primaryBtn}>
        <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar configuração"}
      </button>
    </form>
  );
}

function Info({ label, value, isDark }: { label: string; value: string | null | undefined; isDark: boolean }) {
  return (
    <div>
      <div className={`font-mono text-[10px] uppercase tracking-wide ${isDark ? "text-slate-500" : "text-slate-400"}`}>
        {label}
      </div>
      <div className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{value || "—"}</div>
    </div>
  );
}
