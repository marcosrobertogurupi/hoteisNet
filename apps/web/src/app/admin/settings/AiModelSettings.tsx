"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { cadastroUI } from "../../app/cadastros/_ui";

const c = cadastroUI(false);

interface CatalogModel {
  id: string;
  displayName: string;
  supportsFunctionCalling: boolean;
  price: { inputPerMTokenUsd: number; cachedInputPerMTokenUsd: number; outputPerMTokenUsd: number } | null;
}
interface FeatureRow {
  key: string;
  label: string;
  description: string;
  needsFunctionCalling: boolean;
  defaultModel: string;
  defaultIsExplicit: boolean;
}
interface Props {
  tenants: { id: string; name: string; tradeName: string | null }[];
  canEdit: boolean;
}

function priceHint(m: CatalogModel): string {
  if (!m.price) return "sem preço cadastrado";
  return `US$ ${m.price.inputPerMTokenUsd}/${m.price.outputPerMTokenUsd} por 1M (in/out)`;
}

export default function AiModelSettings({ tenants, canEdit }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [fallbackModel, setFallbackModel] = useState("gemini-2.5-flash");
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/admin/ai-models").then((r) => r.json());
      if (d?.success) {
        setCatalog(d.catalog);
        setFeatures(d.features);
        setFallbackModel(d.fallbackModel);
        setOverrides(d.overridesByTenant || {});
      } else {
        toast.error(d?.error || "Erro ao carregar modelos de IA.");
      }
    } catch {
      toast.error("Falha de rede ao carregar modelos de IA.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const modelsFor = useCallback(
    (needsFc: boolean) => (needsFc ? catalog.filter((m) => m.supportsFunctionCalling) : catalog),
    [catalog]
  );
  const modelLabel = useMemo(() => {
    const map = new Map(catalog.map((m) => [m.id, m.displayName]));
    return (id: string) => map.get(id) || id;
  }, [catalog]);

  const saveDefault = async (feature: string, model: string) => {
    setSavingKey(`def:${feature}`);
    try {
      const res = await fetch("/api/admin/ai-models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, model }),
      });
      const j = await res.json();
      if (j?.success) {
        toast.success("Modelo padrão atualizado.");
        await load();
      } else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveOverride = async (tenantId: string, feature: string, model: string) => {
    setSavingKey(`ov:${tenantId}:${feature}`);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/ai-models`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, model }),
      });
      const j = await res.json();
      if (j?.success) {
        toast.success(model ? "Modelo do assinante fixado." : "Assinante voltou ao padrão da plataforma.");
        await load();
      } else toast.error(j?.error || "Erro ao salvar.");
    } catch {
      toast.error("Falha de rede.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className={`${c.tableCard} p-8 text-center ${c.empty}`}>
        <Loader2 className="w-5 h-5 animate-spin inline" /> Carregando modelos de IA…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Padrão da plataforma por recurso */}
      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-900">Modelo de IA por recurso — padrão da plataforma</h3>
        </div>
        <p className="px-4 pt-3 text-[11px] text-slate-500">
          Vale para todo assinante que não tiver um modelo próprio definido abaixo. Modelos mais baratos reduzem o
          custo; modelos maiores tendem a ser mais assertivos. Recursos marcados com <b>tools</b> só aceitam modelos com
          function calling.
        </p>
        <div className="divide-y divide-slate-200 mt-2">
          {features.map((f) => (
            <div key={f.key} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="md:w-1/2">
                <div className="text-sm font-medium text-slate-800">
                  {f.label} {f.needsFunctionCalling && <span className="text-[10px] text-violet-600 font-bold">tools</span>}
                </div>
                <div className="text-[11px] text-slate-400">{f.description}</div>
              </div>
              <div className="md:w-1/2">
                <select
                  className={c.field}
                  value={f.defaultIsExplicit ? f.defaultModel : ""}
                  disabled={!canEdit || savingKey === `def:${f.key}`}
                  onChange={(e) => saveDefault(f.key, e.target.value)}
                >
                  <option value="">Padrão do sistema ({fallbackModel})</option>
                  {modelsFor(f.needsFunctionCalling).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} — {priceHint(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Override por assinante */}
      <div className={`${c.tableCard} overflow-hidden`}>
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">Modelo de IA por assinante (opcional)</h3>
        </div>
        <p className="px-4 pt-3 pb-1 text-[11px] text-slate-500">
          Deixe em &quot;usar padrão da plataforma&quot; salvo quando um hotel específico precisar de um modelo diferente.
        </p>
        <div className="divide-y divide-slate-200">
          {tenants.map((t) => (
            <div key={t.id} className="p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-900">{t.tradeName || t.name}</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {features.map((f) => {
                  const current = overrides[t.id]?.[f.key] ?? "";
                  return (
                    <label key={f.key} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 w-40 shrink-0 truncate" title={f.label}>
                        {f.label}
                      </span>
                      <select
                        className={`${c.field} !py-1 !text-xs`}
                        value={current}
                        disabled={!canEdit || savingKey === `ov:${t.id}:${f.key}`}
                        onChange={(e) => saveOverride(t.id, f.key, e.target.value)}
                      >
                        <option value="">
                          usar padrão da plataforma ({modelLabel(f.defaultModel)})
                        </option>
                        {modelsFor(f.needsFunctionCalling).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
