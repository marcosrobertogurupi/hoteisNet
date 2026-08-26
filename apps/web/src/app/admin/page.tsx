"use client";

import { useState, useEffect } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Cpu, 
  LifeBuoy, 
  Sparkles, 
  Building2, 
  ShieldAlert, 
  CheckCircle2, 
  Search, 
  ArrowUpRight,
  Settings,
  Database,
  Radio,
  MessageSquare,
  Globe,
  Plus,
  X,
  Check,
  QrCode,
  Volume2,
  ChevronDown,
  ChevronUp,
  Save,
  Link as LinkIcon,
  Play,
  RotateCw
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useTheme } from "@/context/ThemeContext";

export default function SuperAdminDashboardPage() {
  const toast = useToast();
  const { uazapiServerUrl, setUazapiServerUrl, uazapiInstanceToken, setUazapiInstanceToken } = useTheme();
  const [activeTab, setActiveTab] = useState<"TENANTS" | "AI_USAGE" | "SUPPORT_TICKETS" | "SYSTEM_SETTINGS">("TENANTS");

  // Accordion Sections State in System Settings
  const [openSection, setOpenSection] = useState<string>("WHATSAPP");

  // WhatsApp API Instances List (From WinDev Image 2)
  const [instances, setInstances] = useState([
    { id: 11, name: "recepcaoideal", description: "Instância Recepção Principal", status: "ONLINE" },
    { id: 15, name: "n8n_barberia", description: "Instância Automação Barbearia/Serviços", status: "ONLINE" },
  ]);

  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceDesc, setNewInstanceDesc] = useState("");
  const [showQrModal, setShowQrModal] = useState(false);
  const [activeQrInstance, setActiveQrInstance] = useState<string | null>(null);

  // Settings Fields State
  const [apiUrl, setApiUrl] = useState("https://api.netservice.net.br");
  const [adminToken, setAdminToken] = useState("•".repeat(48));
  const [uazapiServerInput, setUazapiServerInput] = useState(uazapiServerUrl);
  const [uazapiTokenInput, setUazapiTokenInput] = useState(uazapiInstanceToken);
  const [apiOnlineToggle, setApiOnlineToggle] = useState(true);
  const [mediaPath, setMediaPath] = useState("C:\\NETSERV\\HOTEISNET\\WIN.WAV");
  const [webhookUrl, setWebhookUrl] = useState("https://n8n.netservice.net.br/webhook-test/barberia-hoteisnet");
  const [webhookConnected, setWebhookConnected] = useState(true);
  const [saveToast, setSaveToast] = useState(false);

  // Hub do Desenvolvedor Master Token & Tenant Quota State
  const [hubMasterToken, setHubMasterToken] = useState("183262310hxRtwiDQAo330874544");
  const [hubApiStatus, setHubApiStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [quotaStarter, setQuotaStarter] = useState(100);
  const [quotaPro, setQuotaPro] = useState(500);
  const [quotaEnterprise, setQuotaEnterprise] = useState(2000);
  const [excessCost, setExcessCost] = useState("0,15");

  // Cota real de consultas de CPF por assinante (Tenant.cpfQueryQuotaMonthly no banco)
  interface TenantCpfQuota {
    id: string;
    name: string;
    tradeName: string | null;
    city: string | null;
    state: string | null;
    planName: string | null;
    cpfQueryQuotaMonthly: number;
    cpfQueryUsed: number;
    cpfQueryEnabled: boolean;
    planAiTokenQuota: number | null;
    aiSystemPromptExtra: string;
    aiTokenQuotaOverride: number | null;
    aiBlocked: boolean;
  }
  const [tenantQuotas, setTenantQuotas] = useState<TenantCpfQuota[]>([]);
  const [tenantQuotaDrafts, setTenantQuotaDrafts] = useState<Record<string, string>>({});
  const [isLoadingTenantQuotas, setIsLoadingTenantQuotas] = useState(false);
  const [savingTenantQuotaId, setSavingTenantQuotaId] = useState<string | null>(null);

  // Controle admin do agente de IA por assinante: prompt de personalidade, override de cota de
  // tokens e bloqueio de uso — nunca editáveis pela tela de Configurações do próprio assinante.
  const [aiPromptDrafts, setAiPromptDrafts] = useState<Record<string, string>>({});
  const [aiQuotaOverrideDrafts, setAiQuotaOverrideDrafts] = useState<Record<string, string>>({});
  const [savingAiSettingsId, setSavingAiSettingsId] = useState<string | null>(null);

  const loadTenantQuotas = () => {
    setIsLoadingTenantQuotas(true);
    fetch("/api/admin/tenants")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTenantQuotas(data.tenants);
          setTenantQuotaDrafts(
            Object.fromEntries(data.tenants.map((t: TenantCpfQuota) => [t.id, String(t.cpfQueryQuotaMonthly)]))
          );
          setAiPromptDrafts(
            Object.fromEntries(data.tenants.map((t: TenantCpfQuota) => [t.id, t.aiSystemPromptExtra || ""]))
          );
          setAiQuotaOverrideDrafts(
            Object.fromEntries(
              data.tenants.map((t: TenantCpfQuota) => [t.id, t.aiTokenQuotaOverride == null ? "" : String(t.aiTokenQuotaOverride)])
            )
          );
        }
      })
      .catch((err) => console.error("Erro ao buscar cota de CPF dos assinantes", err))
      .finally(() => setIsLoadingTenantQuotas(false));
  };

  const handleSaveAiSettings = async (tenantId: string) => {
    const rawOverride = aiQuotaOverrideDrafts[tenantId] ?? "";
    const parsedOverride = rawOverride.trim() === "" ? null : Number(rawOverride);
    if (parsedOverride !== null && (!Number.isInteger(parsedOverride) || parsedOverride < 0)) {
      toast.error("Override de cota de tokens deve ser um número inteiro maior ou igual a zero, ou vazio.");
      return;
    }
    setSavingAiSettingsId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiSystemPromptExtra: aiPromptDrafts[tenantId] ?? "",
          aiTokenQuotaOverride: parsedOverride,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Configuração de IA do assinante atualizada!");
        setTenantQuotas((prev) =>
          prev.map((t) =>
            t.id === tenantId
              ? { ...t, aiSystemPromptExtra: aiPromptDrafts[tenantId] ?? "", aiTokenQuotaOverride: parsedOverride }
              : t
          )
        );
      } else {
        toast.error(data.error || "Erro ao salvar configuração de IA do assinante.");
      }
    } catch {
      toast.error("Erro ao salvar configuração de IA do assinante.");
    } finally {
      setSavingAiSettingsId(null);
    }
  };

  const handleToggleCpfEnabled = async (tenantId: string, enabled: boolean) => {
    setSavingTenantQuotaId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfQueryEnabled: enabled }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(enabled ? "Consulta de CPF habilitada para este assinante." : "Consulta de CPF desabilitada para este assinante.");
        setTenantQuotas((prev) => prev.map((t) => (t.id === tenantId ? { ...t, cpfQueryEnabled: enabled } : t)));
      } else {
        toast.error(data.error || "Erro ao atualizar habilitação da consulta de CPF.");
      }
    } catch {
      toast.error("Erro ao atualizar habilitação da consulta de CPF.");
    } finally {
      setSavingTenantQuotaId(null);
    }
  };

  const handleToggleAiBlocked = async (tenantId: string, blocked: boolean) => {
    setSavingAiSettingsId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiBlocked: blocked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(blocked ? "IA bloqueada para este assinante." : "IA desbloqueada para este assinante.");
        setTenantQuotas((prev) => prev.map((t) => (t.id === tenantId ? { ...t, aiBlocked: blocked } : t)));
      } else {
        toast.error(data.error || "Erro ao atualizar bloqueio de IA.");
      }
    } catch {
      toast.error("Erro ao atualizar bloqueio de IA.");
    } finally {
      setSavingAiSettingsId(null);
    }
  };

  useEffect(() => {
    loadTenantQuotas();
  }, []);

  const handleSaveTenantQuota = async (tenantId: string) => {
    const draft = Number(tenantQuotaDrafts[tenantId]);
    if (!Number.isInteger(draft) || draft < 0) {
      toast.error("Informe uma cota válida (número inteiro maior ou igual a zero).");
      return;
    }
    setSavingTenantQuotaId(tenantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpfQueryQuotaMonthly: draft }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Cota de consultas de CPF atualizada!");
        setTenantQuotas((prev) =>
          prev.map((t) => (t.id === tenantId ? { ...t, cpfQueryQuotaMonthly: draft } : t))
        );
      } else {
        toast.error(data.error || "Erro ao atualizar a cota do assinante.");
      }
    } catch {
      toast.error("Erro ao atualizar a cota do assinante.");
    } finally {
      setSavingTenantQuotaId(null);
    }
  };

  // Sample Tenants List with CPF Queries Telemetry
  const tenants = [
    { id: "TNT-01", name: "Pousada Sol & Mar", city: "Búzios, RJ", plan: "PRO", rooms: 24, status: "ACTIVE", mrr: "R$ 490,00", aiTokens: "34.200 / 50.000", aiCost: "R$ 8,50", cpfQueries: "142 / 500", cpfCost: "R$ 21,30", cpfStatus: "OK" },
    { id: "TNT-02", name: "Hotel Praia Azul", city: "Salvador, BA", plan: "ENTERPRISE", rooms: 85, status: "ACTIVE", mrr: "R$ 1.290,00", aiTokens: "112.000 / 250.000", aiCost: "R$ 28,10", cpfQueries: "680 / 2.000", cpfCost: "R$ 102,00", cpfStatus: "OK" },
    { id: "TNT-03", name: "Resort Montanha Real", city: "Gramado, RS", plan: "ENTERPRISE", rooms: 120, status: "ACTIVE", mrr: "R$ 1.890,00", aiTokens: "185.400 / 250.000", aiCost: "R$ 46,30", cpfQueries: "1.420 / 2.000", cpfCost: "R$ 213,00", cpfStatus: "OK" },
    { id: "TNT-04", name: "Pousada Cantinho da Serra", city: "Campos do Jordão, SP", plan: "STARTER", rooms: 12, status: "TRIAL", mrr: "R$ 0,00 (Degustação)", aiTokens: "4.100 / 15.000", aiCost: "R$ 1,02", cpfQueries: "38 / 100", cpfCost: "R$ 5,70", cpfStatus: "OK" },
    { id: "TNT-05", name: "Hotel Central Executivo", city: "São Paulo, SP", plan: "PRO", rooms: 45, status: "OVERDUE", mrr: "R$ 690,00", aiTokens: "48.900 / 50.000", aiCost: "R$ 12,20", cpfQueries: "498 / 500", cpfCost: "R$ 74,70", cpfStatus: "ALERTA" },
  ];

  // Sample AI Usage Telemetry Data
  const aiTelemetry = [
    { feature: "IA Suporte RAG (Embeddings Supabase)", requests: 1420, tokens: 680000, costUsd: "$ 1.36", status: "HEALTHY" },
    { feature: "Pré-Checkin FNRH Preditivo", requests: 890, tokens: 340000, costUsd: "$ 0.68", status: "HEALTHY" },
    { feature: "Concierge WhatsApp", requests: 2150, tokens: 1240000, costUsd: "$ 2.48", status: "HEALTHY" },
  ];

  // Sample Tickets in Master Console
  const masterTickets = [
    { id: "TKT-1082", tenant: "Pousada Sol & Mar", subject: "Dúvida na transmissão da FNRH para o SNRHos", aiHandled: true, confidence: "94%", status: "RESOLVED_BY_AI" },
    { id: "TKT-1083", tenant: "Hotel Central Executivo", subject: "Dificuldade na configuração de Faturamento Corporativo", aiHandled: false, confidence: "62%", status: "HUMAN_ACTION_REQUIRED" },
  ];

  const handleAddInstance = () => {
    if (!newInstanceName.trim()) return;
    const newId = Math.floor(Math.random() * 80) + 20;
    setInstances(prev => [...prev, {
      id: newId,
      name: newInstanceName.trim(),
      description: newInstanceDesc.trim() || "Nova Instância Conectada",
      status: "ONLINE"
    }]);
    setNewInstanceName("");
    setNewInstanceDesc("");
  };

  const handleRemoveInstance = (id: number) => {
    setInstances(prev => prev.filter(i => i.id !== id));
  };

  const handleSaveSettings = () => {
    setUazapiServerUrl(uazapiServerInput.trim());
    setUazapiInstanceToken(uazapiTokenInput.trim());
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* SaaS Global Financial Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">MRR (Receita Recorrente)</span>
            <span className="text-2xl font-bold font-mono text-[#10B981] mt-1 block">R$ 18.450,00</span>
            <span className="text-[10px] text-[#10B981] mt-0.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +14.2% este mês
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Assinantes Ativos</span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">12 Hotéis</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">1 em Trial / Degustação</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#0284C7]/15 border border-[#0284C7]/30 flex items-center justify-center text-[#0284C7]">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Consumo Mensal de IA</span>
            <span className="text-2xl font-bold font-mono text-[#F59E0B] mt-1 block">2.260.000 Tokens</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Custo Total: $ 4,52 USD</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
            <Cpu className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Autonomia IA Suporte</span>
            <span className="text-2xl font-bold font-mono text-[#38BDF8] mt-1 block">88.5%</span>
            <span className="text-[10px] text-[#10B981] mt-0.5 block">Resolvidos sem humano</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8]">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Console Tab Selectors */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("TENANTS")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "TENANTS"
              ? "bg-[#F59E0B] text-slate-950 font-semibold"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" /> Assinantes & Hotéis ({tenants.length})
        </button>

        <button
          onClick={() => setActiveTab("SYSTEM_SETTINGS")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "SYSTEM_SETTINGS"
              ? "bg-[#0284C7] text-white font-semibold shadow-lg shadow-[#0284C7]/20"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Settings className="w-4 h-4 text-[#38BDF8]" /> Configuração do Sistema
        </button>

        <button
          onClick={() => setActiveTab("AI_USAGE")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "AI_USAGE"
              ? "bg-[#F59E0B] text-slate-950 font-semibold"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Cpu className="w-4 h-4" /> Telemetria de IA & Limites
        </button>

        <button
          onClick={() => setActiveTab("SUPPORT_TICKETS")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "SUPPORT_TICKETS"
              ? "bg-[#F59E0B] text-slate-950 font-semibold"
              : "bg-[#0F172A] text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <LifeBuoy className="w-4 h-4" /> Master Support Console ({masterTickets.length})
        </button>
      </div>

      {/* TAB 1: Tenants List & Billing Status */}
      {activeTab === "TENANTS" && (
        <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">Gestão de Tenancy & Assinaturas SaaS</h3>
            <span className="text-xs text-slate-400">Total: {tenants.length} propriedades ativas</span>
          </div>
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/60 uppercase font-mono text-[10px] text-slate-400">
              <tr>
                <th className="p-3">ID / Hotel</th>
                <th className="p-3">Cidade/UF</th>
                <th className="p-3">Plano</th>
                <th className="p-3">Quartos</th>
                <th className="p-3">Status</th>
                <th className="p-3">MRR</th>
                <th className="p-3">Uso IA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-semibold text-white">{t.name} <span className="text-[10px] font-mono text-slate-500 block">{t.id}</span></td>
                  <td className="p-3 text-slate-400">{t.city}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">{t.plan}</span></td>
                  <td className="p-3 font-mono">{t.rooms} acc</td>
                  <td className="p-3">
                    {t.status === "ACTIVE" && <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">ATIVO</span>}
                    {t.status === "TRIAL" && <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-bold">DEGUSTAÇÃO</span>}
                    {t.status === "OVERDUE" && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">PENDENTE</span>}
                  </td>
                  <td className="p-3 font-mono text-emerald-400 font-bold">{t.mrr}</td>
                  <td className="p-3 font-mono text-slate-400">{t.aiTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: SYSTEM CONFIGURATION (WINDEV SCREEN EQUIVALENT IMAGE 2) */}
      {activeTab === "SYSTEM_SETTINGS" && (
        <div className="space-y-4">
          {/* Header Banner */}
          <div className="p-5 rounded-2xl bg-[#0F172A] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#0284C7] mb-1">
                <Settings className="w-4 h-4 text-[#38BDF8]" />
                Módulo de Configuração do Sistema
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Configuração Geral do Sistema SaaS (Painel Admin)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Gerencie conexões de Banco de Dados, Automação IoT, API WhatsApp (Uazapi), Webhooks e dados globais do sistema.
              </p>
            </div>

            <button
              onClick={handleSaveSettings}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0369A1] text-white font-semibold text-xs shadow-lg shadow-[#0284C7]/20 hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              {saveToast ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" /> Configurações Salvas!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Salvar Configuração
                </>
              )}
            </button>
          </div>

          {/* ACCORDION SECTIONS MATCHING WINDEV SCHEME (IMAGE 2) */}

          {/* SECTION 1: BANCO DE DADOS */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "DATABASE" ? "" : "DATABASE")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4" /> Banco de Dados
              </span>
              {openSection === "DATABASE" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "DATABASE" && (
              <div className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Servidor API Principal</label>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Chave / Token Adm / Conexão</label>
                    <input
                      type="password"
                      value={adminToken}
                      onChange={(e) => setAdminToken(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: AUTOMAÇÃO */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "AUTOMATION" ? "" : "AUTOMATION")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Radio className="w-4 h-4" /> Automação
              </span>
              {openSection === "AUTOMATION" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "AUTOMATION" && (
              <div className="p-6 space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <span className="font-bold text-white block">Gateway de Automação IoT dos Quartos</span>
                  <p className="text-slate-400">
                    Sincronização de fechaduras eletrônicas (Bluetooth/RFID), relés de energia e ar-condicionado dos apartamentos.
                  </p>
                  <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold inline-block">
                    Status: Gateway Ativo (100% dos quartos respondendo)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: API WHATSAPP (MATCHING WINDEV IMAGE 2 EXACTLY) */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "WHATSAPP" ? "" : "WHATSAPP")}
              className="w-full px-6 py-4 bg-[#0284C7] text-white font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors shadow-md"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> API Whatsapp
              </span>
              {openSection === "WHATSAPP" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "WHATSAPP" && (
              <div className="p-6 space-y-6 text-xs">
                {/* Servidor API & Token Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Servidor API WhatsApp (Uazapi)</label>
                    <input
                      type="text"
                      value={uazapiServerInput}
                      onChange={(e) => setUazapiServerInput(e.target.value)}
                      placeholder="https://netservice.uazapi.com"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Chave/Token Adm/Conexão</label>
                    <input
                      type="password"
                      value={uazapiTokenInput}
                      onChange={(e) => setUazapiTokenInput(e.target.value)}
                      placeholder="fbe5bfbb-226a-47a2-9d1d-6b657933318c"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>
                </div>

                {/* Instance Registration Form & API Toggle */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* Left: Instance Form & Table */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <span className="font-bold text-white text-xs block">Cadastrar Nova Instância</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Nome da instância (ex: recepcaoideal)"
                          value={newInstanceName}
                          onChange={(e) => setNewInstanceName(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#38BDF8]"
                        />
                        <input
                          type="text"
                          placeholder="Descrição da instância"
                          value={newInstanceDesc}
                          onChange={(e) => setNewInstanceDesc(e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#38BDF8]"
                        />
                      </div>
                      <button
                        onClick={handleAddInstance}
                        className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Adicionar Instância
                      </button>
                    </div>

                    {/* Table of Active Instances */}
                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#0284C7]/20 text-[#38BDF8] font-mono text-[10px] uppercase">
                          <tr>
                            <th className="p-2.5">ID Inst</th>
                            <th className="p-2.5">Nome Instância</th>
                            <th className="p-2.5">Situação</th>
                            <th className="p-2.5 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                          {instances.map(inst => (
                            <tr key={inst.id} className="hover:bg-slate-800/40">
                              <td className="p-2.5 font-mono text-slate-400">{inst.id}</td>
                              <td className="p-2.5 font-bold text-white">{inst.name} <span className="text-[10px] text-slate-500 font-normal block">{inst.description}</span></td>
                              <td className="p-2.5">
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                                  {inst.status}
                                </span>
                              </td>
                              <td className="p-2.5 text-right">
                                <button
                                  onClick={() => handleRemoveInstance(inst.id)}
                                  className="text-red-400 hover:text-red-300 p-1"
                                  title="Remover"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Instance Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setActiveQrInstance("recepcaoideal");
                          setShowQrModal(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs flex items-center gap-1.5"
                      >
                        <QrCode className="w-4 h-4" /> Conectar Instância (QR Code)
                      </button>

                      <button
                        onClick={() => toast.info("Status das Instâncias: 100% Operacional")}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs"
                      >
                        Status da Instância
                      </button>

                      <button
                        onClick={() => toast.info("Desconectando instâncias ativas...")}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs"
                      >
                        Desconectar Instância
                      </button>

                      <button
                        onClick={() => toast.info("Baixando histórico de mensagens lidas...")}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs"
                      >
                        Baixar Msg Lidas
                      </button>
                    </div>
                  </div>

                  {/* Right: QR Code Display Container & Toggle */}
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-between text-center space-y-4">
                    <div className="flex items-center justify-between w-full border-b border-slate-800 pb-2">
                      <span className="text-xs font-mono font-semibold text-slate-400 uppercase">Status da API</span>
                      <button
                        onClick={() => setApiOnlineToggle(!apiOnlineToggle)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                          apiOnlineToggle ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        API ONline: {apiOnlineToggle ? "ON" : "OFF"}
                      </button>
                    </div>

                    <div className="p-4 bg-white rounded-2xl shadow-xl space-y-2">
                      <QrCode className="w-36 h-36 text-slate-900 mx-auto" />
                      <span className="text-[10px] font-mono text-slate-600 block">QR CODE UAZAPI</span>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Escaneie o QR Code no seu aplicativo WhatsApp para autorizar o Concierge Inteligente Hoteis.Net.
                    </p>
                  </div>
                </div>

                {/* Notification Audio Path & Webhook */}
                <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-[#F59E0B]" /> Arq.Mídia ao receber mensagem whats app
                    </label>
                    <input
                      type="text"
                      value={mediaPath}
                      onChange={(e) => setMediaPath(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1 flex items-center gap-1.5">
                      <LinkIcon className="w-4 h-4 text-[#38BDF8]" /> URL WebHook (N8N / Zapier)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-[#38BDF8]"
                      />
                      <button
                        onClick={() => {
                          setWebhookConnected(true);
                          toast.success("Webhook testado e conectado com sucesso!");
                        }}
                        className="px-4 py-2.5 rounded-xl bg-[#0284C7] text-white font-semibold text-xs whitespace-nowrap"
                      >
                        Conectar WebHook
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: HUB DO DESENVOLVEDOR - CONSULTAS CPF/CNPJ */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "HUB_DEV" ? "" : "HUB_DEV")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#F59E0B]" /> Integração Hub do Desenvolvedor (CPF / CNPJ Compartilhada)
              </span>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                  hubApiStatus === "ACTIVE" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}>
                  {hubApiStatus === "ACTIVE" ? "API Compartilhada Ativa" : "Inativa"}
                </span>
                {openSection === "HUB_DEV" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {openSection === "HUB_DEV" && (
              <div className="p-6 space-y-6 text-xs">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-white text-sm flex items-center gap-2">
                        Token Master da API Hub do Desenvolvedor (Provedor de Dados SaaS)
                      </h4>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Esta chave é utilizada pelo sistema central para realizar consultas de CPF no cadastro de hóspedes e FNRH de todos os assinantes contratantes.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleSaveSettings();
                        toast.success("Configurações do Hub do Desenvolvedor salvas com sucesso no servidor SaaS!");
                      }}
                      className="px-4 py-2 bg-[#10B981] hover:bg-[#059669] text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md"
                    >
                      <Save className="w-3.5 h-3.5" /> Salvar Master Token
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-slate-300 font-semibold block">Token Master Global (HUB_DESENVOLVEDOR_TOKEN)</label>
                      <input
                        type="password"
                        value={hubMasterToken}
                        onChange={(e) => setHubMasterToken(e.target.value)}
                        placeholder="Insira o Token do Hub do Desenvolvedor..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono text-xs focus:outline-none focus:border-[#38BDF8]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-300 font-semibold block">Status do Serviço</label>
                      <select
                        value={hubApiStatus}
                        onChange={(e) => setHubApiStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white text-xs"
                      >
                        <option value="ACTIVE">Habilitado para todos os Assinantes</option>
                        <option value="INACTIVE">Suspenso Temporariamente</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Configuração de Cotas por Plano de Assinatura */}
                <div className="space-y-3">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                    Definição de Cotas de Consultas CPF/CNPJ por Plano
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-slate-300 block">Plano STARTER</span>
                      <label className="text-[11px] text-slate-400 block">Consultas CPF/mês inclusas</label>
                      <input
                        type="number"
                        value={quotaStarter}
                        onChange={(e) => setQuotaStarter(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-[#0284C7] block">Plano PRO</span>
                      <label className="text-[11px] text-slate-400 block">Consultas CPF/mês inclusas</label>
                      <input
                        type="number"
                        value={quotaPro}
                        onChange={(e) => setQuotaPro(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-[#F59E0B] block">Plano ENTERPRISE</span>
                      <label className="text-[11px] text-slate-400 block">Consultas CPF/mês inclusas</label>
                      <input
                        type="number"
                        value={quotaEnterprise}
                        onChange={(e) => setQuotaEnterprise(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-emerald-400 block">Custo por Consulta Extra</span>
                      <label className="text-[11px] text-slate-400 block">Valor R$ por requisição excedente</label>
                      <input
                        type="text"
                        value={excessCost}
                        onChange={(e) => setExcessCost(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Cota de Consultas de CPF por Assinante (dado real, editável individualmente) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                      Cota de Consultas de CPF por Assinante
                    </h4>
                    <button
                      type="button"
                      onClick={loadTenantQuotas}
                      className="text-[11px] font-bold text-[#38BDF8] hover:text-[#7dd3fc] flex items-center gap-1"
                    >
                      <RotateCw className="w-3 h-3" /> Atualizar
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                          <th className="text-left px-3 py-2">Assinante</th>
                          <th className="text-left px-3 py-2">Plano</th>
                          <th className="text-left px-3 py-2">Uso no Mês</th>
                          <th className="text-left px-3 py-2">Cota Mensal</th>
                          <th className="text-left px-3 py-2">Recurso</th>
                          <th className="text-left px-3 py-2">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingTenantQuotas ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                              Carregando assinantes...
                            </td>
                          </tr>
                        ) : tenantQuotas.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                              Nenhum assinante cadastrado.
                            </td>
                          </tr>
                        ) : (
                          tenantQuotas.map((t) => (
                            <tr key={t.id} className="border-t border-slate-800 bg-slate-950/40">
                              <td className="px-3 py-2 text-white font-semibold">
                                {t.tradeName || t.name}
                                <span className="block text-[10px] text-slate-500 font-normal">
                                  {[t.city, t.state].filter(Boolean).join(" / ") || "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-300">{t.planName || "—"}</td>
                              <td className="px-3 py-2 font-mono text-slate-300">
                                {t.cpfQueryUsed} / {t.cpfQueryQuotaMonthly}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={tenantQuotaDrafts[t.id] ?? ""}
                                  onChange={(e) =>
                                    setTenantQuotaDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white font-mono font-bold"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  disabled={savingTenantQuotaId === t.id}
                                  onClick={() => handleToggleCpfEnabled(t.id, !t.cpfQueryEnabled)}
                                  className={`px-2.5 py-1 rounded-lg font-bold uppercase text-[10px] transition disabled:opacity-50 ${
                                    t.cpfQueryEnabled
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                                      : "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
                                  }`}
                                >
                                  {t.cpfQueryEnabled ? "Habilitado" : "Desabilitado"}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  disabled={savingTenantQuotaId === t.id}
                                  onClick={() => handleSaveTenantQuota(t.id)}
                                  className="px-3 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] disabled:opacity-50 text-white font-bold rounded-lg transition"
                                >
                                  {savingTenantQuotaId === t.id ? "Salvando..." : "Salvar"}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: CONTROLE DO AGENTE DE IA POR ASSINANTE (prompt, cota, bloqueio) */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "AI_AGENT_ADMIN" ? "" : "AI_AGENT_ADMIN")}
              className="w-full px-6 py-4 bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-400" /> Agentes de IA — Prompt, Cota de Tokens e Bloqueio por Assinante
              </span>
              {openSection === "AI_AGENT_ADMIN" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "AI_AGENT_ADMIN" && (
              <div className="p-6 space-y-4 text-xs">
                <p className="text-slate-400">
                  Estes controles são exclusivos do SuperAdmin — o assinante nunca vê nem edita o prompt cru,
                  só escolhe presets de tom nas próprias Configurações. Cota de tokens sem override usa o valor
                  do plano contratado.
                </p>

                {isLoadingTenantQuotas ? (
                  <p className="text-slate-500 text-center py-4">Carregando assinantes...</p>
                ) : tenantQuotas.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">Nenhum assinante cadastrado.</p>
                ) : (
                  <div className="space-y-4">
                    {tenantQuotas.map((t) => (
                      <div key={t.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-white font-semibold">{t.tradeName || t.name}</span>
                            <span className="block text-[10px] text-slate-500">
                              {[t.city, t.state].filter(Boolean).join(" / ") || "—"} · Plano {t.planName || "—"}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={savingAiSettingsId === t.id}
                            onClick={() => handleToggleAiBlocked(t.id, !t.aiBlocked)}
                            className={`px-3 py-1.5 rounded-lg font-bold uppercase text-[10px] transition disabled:opacity-50 ${
                              t.aiBlocked
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
                                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                            }`}
                          >
                            {t.aiBlocked ? "IA Bloqueada — Desbloquear" : "IA Liberada — Bloquear"}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-slate-300 font-semibold block">
                              Prompt de personalidade e forma de atendimento (admin)
                            </label>
                            <textarea
                              value={aiPromptDrafts[t.id] ?? ""}
                              onChange={(e) => setAiPromptDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              rows={3}
                              placeholder="Ex: Trate os hóspedes deste hotel de forma calorosa e regional, mencionando sempre o café da manhã caseiro."
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-300 font-semibold block">Override de cota de tokens/mês</label>
                            <input
                              type="number"
                              min={0}
                              value={aiQuotaOverrideDrafts[t.id] ?? ""}
                              onChange={(e) => setAiQuotaOverrideDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder={`Padrão do plano: ${t.planAiTokenQuota ?? "—"}`}
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={savingAiSettingsId === t.id}
                            onClick={() => handleSaveAiSettings(t.id)}
                            className="px-4 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-bold rounded-lg transition"
                          >
                            {savingAiSettingsId === t.id ? "Salvando..." : "Salvar"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 4: CONFIGURAÇÕES GERAIS DO SISTEMA */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "GENERAL" ? "" : "GENERAL")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4" /> Configuração gerais do sistema
              </span>
              {openSection === "GENERAL" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "GENERAL" && (
              <div className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Horário Padrão Check-in</label>
                    <input type="text" defaultValue="14:00" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Horário Padrão Checkout</label>
                    <input type="text" defaultValue="12:00" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Fuso Horário Padrão</label>
                    <input type="text" defaultValue="America/Sao_Paulo (UTC-3)" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: HOTEL (DADOS) */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "HOTEL_INFO" ? "" : "HOTEL_INFO")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors border-b border-slate-800"
            >
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Hotel (dados)
              </span>
              {openSection === "HOTEL_INFO" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "HOTEL_INFO" && (
              <div className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Razão Social</label>
                    <input type="text" defaultValue="HOTEIS.NET HOTELARIA & SERVICOS LTDA" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">CNPJ</label>
                    <input type="text" defaultValue="12.345.678/0001-90" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 6: CONFIGURAÇÕES DE MENSAGENS */}
          <div className="rounded-2xl bg-[#0F172A] border border-slate-800 overflow-hidden shadow-lg">
            <button
              onClick={() => setOpenSection(openSection === "MESSAGES" ? "" : "MESSAGES")}
              className="w-full px-6 py-4 bg-[#0284C7]/15 hover:bg-[#0284C7]/25 text-[#38BDF8] font-bold text-sm tracking-wide uppercase flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Configurações de mensagens
              </span>
              {openSection === "MESSAGES" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {openSection === "MESSAGES" && (
              <div className="p-6 space-y-4 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Template Mensagem de Boas-Vindas Check-in</label>
                  <textarea
                    rows={3}
                    defaultValue="Olá {HOSPEDE}, seja bem-vindo ao {HOTEL}! Seu quarto é o {QUARTO}. Desejamos uma excelente estadia!"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR CODE MODAL FOR INSTANCE CONNECTION */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 text-center shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">QR Code Instância `{activeQrInstance}`</h3>
              <button onClick={() => setShowQrModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow-inner">
              <QrCode className="w-44 h-44 text-slate-950 mx-auto" />
            </div>

            <p className="text-xs text-slate-300">
              Escaneie este QR Code no WhatsApp para autenticar a instância do hotel no SaaS.
            </p>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-xs"
            >
              Concluir Conexão
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
