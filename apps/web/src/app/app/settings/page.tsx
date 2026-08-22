"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { useTheme, THEMES, ThemeId } from "@/context/ThemeContext";
import { getReservationExpirationDate, formatExpirationLimit } from "@/utils/reservationTolerance";
import { playWhatsappNotificationSound, playHumanInterventionSound } from "@/utils/notificationSound";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  Palette, 
  Image as ImageIcon, 
  Check, 
  Sparkles, 
  Building, 
  Save, 
  Printer, 
  Layout, 
  Upload, 
  Eye, 
  RefreshCw,
  ShieldCheck,
  Globe,
  TimerOff,
  Clock3,
  Info,
  Mail,
  Send,
  EyeOff,
  Lock,
  FileText,
  CalendarClock,
  PackageX,
  MessageCircle,
  PartyPopper,
  LogOut,
  BellRing,
  Smartphone,
  QrCode,
  PlugZap,
  Unplug,
  Webhook,
  Volume2,
  Bot,
  ListChecks,
  UserCheck,
} from "lucide-react";

export default function SubscriberSettingsPage() {
  const { 
    currentTheme, 
    setTheme, 
    theme, 
    hotelLogo, 
    setHotelLogo, 
    hotelName, 
    setHotelName,
    showLogoInHeader,
    setShowLogoInHeader,
    showLogoInPrint,
    setShowLogoInPrint,
    defaultCheckInTime,
    setDefaultCheckInTime,
    defaultCheckOutTime,
    setDefaultCheckOutTime,
    reservationToleranceHours,
    setReservationToleranceHours,
    // E-mail / SMTP
    emailSmtpHost,
    setEmailSmtpHost,
    emailSmtpPort,
    setEmailSmtpPort,
    emailSmtpSecure,
    setEmailSmtpSecure,
    emailSmtpUser,
    setEmailSmtpUser,
    emailSmtpPass,
    setEmailSmtpPass,
    emailFromName,
    setEmailFromName,
    emailFromAddress,
    setEmailFromAddress,
    emailFooterText,
    setEmailFooterText,
    sendVoucherEmailEnabled,
    setSendVoucherEmailEnabled,
    sendReceiptEmailEnabled,
    setSendReceiptEmailEnabled,
    sendPaymentConfirmEmailEnabled,
    setSendPaymentConfirmEmailEnabled,
    whatsappSoundEnabled,
    setWhatsappSoundEnabled,
    humanInterventionSoundEnabled,
    setHumanInterventionSoundEnabled,
  } = useTheme();

  const [inputName, setInputName] = useState(hotelName);
  const [logoInput, setLogoInput] = useState(hotelLogo || "");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [checkInTimeInput, setCheckInTimeInput] = useState(defaultCheckInTime);
  const [checkOutTimeInput, setCheckOutTimeInput] = useState(defaultCheckOutTime);
  const [toleranceInput, setToleranceInput] = useState(String(reservationToleranceHours));

  // Estados de E-mail / SMTP
  const [smtpHostInput, setSmtpHostInput] = useState(emailSmtpHost);
  const [smtpPortInput, setSmtpPortInput] = useState(String(emailSmtpPort));
  const [smtpSecureInput, setSmtpSecureInput] = useState(emailSmtpSecure);
  const [smtpUserInput, setSmtpUserInput] = useState(emailSmtpUser);
  const [smtpPassInput, setSmtpPassInput] = useState(emailSmtpPass);
  const [fromNameInput, setFromNameInput] = useState(emailFromName);
  const [fromAddressInput, setFromAddressInput] = useState(emailFromAddress);
  const [footerTextInput, setFooterTextInput] = useState(emailFooterText);
  const [optVoucherInput, setOptVoucherInput] = useState(sendVoucherEmailEnabled);
  const [optReceiptInput, setOptReceiptInput] = useState(sendReceiptEmailEnabled);
  const [optPaymentInput, setOptPaymentInput] = useState(sendPaymentConfirmEmailEnabled);

  const [showEmailPass, setShowEmailPass] = useState(false);
  const [testingEmailSmtp, setTestingEmailSmtp] = useState(false);
  const [emailTestStatus, setEmailTestStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Horário de virada de diária — persistido no Tenant (usado pelo worker de virada automática)
  const [dailyRolloverTimeInput, setDailyRolloverTimeInput] = useState("14:30");
  const [rolloverSaveError, setRolloverSaveError] = useState<string | null>(null);

  // Aceitar estoque negativo — permite baixar o estoque do PDV no lançamento de consumo mesmo
  // quando o saldo disponível é insuficiente, em vez de bloquear o lançamento.
  const [allowNegativeStockInput, setAllowNegativeStockInput] = useState(false);
  const [breakfastHoursInput, setBreakfastHoursInput] = useState("");

  // Mensagens automáticas de WhatsApp para o hóspede (confirmação de reserva, boas-vindas no
  // check-in, previsão de check-out e check-out) — persistidas no Tenant e lidas pelo worker
  // e pelas telas que disparam cada evento.
  const [waReservaEnabled, setWaReservaEnabled] = useState(true);
  const [waReservaMessage, setWaReservaMessage] = useState("");
  const [waCheckinEnabled, setWaCheckinEnabled] = useState(true);
  const [waCheckinMessage, setWaCheckinMessage] = useState("");
  const [waPrevisaoEnabled, setWaPrevisaoEnabled] = useState(false);
  const [waPrevisaoMessage, setWaPrevisaoMessage] = useState("");
  const [waPrevisaoTime, setWaPrevisaoTime] = useState("10:00");
  const [waCheckoutEnabled, setWaCheckoutEnabled] = useState(false);
  const [waCheckoutMessage, setWaCheckoutMessage] = useState("");
  const [waPreCheckinEnabled, setWaPreCheckinEnabled] = useState(true);
  const [waPreCheckinMessage, setWaPreCheckinMessage] = useState("");
  const [waPreCheckinHoursBefore, setWaPreCheckinHoursBefore] = useState(3);
  const [waSaveError, setWaSaveError] = useState<string | null>(null);

  const [snrhosEnvironment, setSnrhosEnvironment] = useState("HOMOLOGACAO");
  const [snrhosApiUsername, setSnrhosApiUsername] = useState("");
  const [snrhosApiPassword, setSnrhosApiPassword] = useState("");
  const [snrhosApiPasswordConfigured, setSnrhosApiPasswordConfigured] = useState(false);
  const [snrhosCpfSolicitante, setSnrhosCpfSolicitante] = useState("");
  const [snrhosEnabled, setSnrhosEnabled] = useState(false);
  const [snrhosSaveError, setSnrhosSaveError] = useState<string | null>(null);

  const [aiAgentEnabled, setAiAgentEnabled] = useState(false);
  const [aiAgentAutoConfirm, setAiAgentAutoConfirm] = useState(false);
  const [aiAgentAllowCancel, setAiAgentAllowCancel] = useState(false);
  const [aiAgentDisplayName, setAiAgentDisplayName] = useState("");
  const [aiAgentAvatarUrl, setAiAgentAvatarUrl] = useState("");
  const [aiAgentAvatarUploadError, setAiAgentAvatarUploadError] = useState<string | null>(null);
  const [aiAgentTonePreset, setAiAgentTonePreset] = useState("PROFISSIONAL");
  const [aiAgentMonitoringEnabled, setAiAgentMonitoringEnabled] = useState(false);
  const [aiAgentAlertPhone, setAiAgentAlertPhone] = useState("");
  const [aiAgentAutonomyMode, setAiAgentAutonomyMode] = useState("ALERT_ONLY");
  const [aiAgentSaveError, setAiAgentSaveError] = useState<string | null>(null);

  // Governança de quartos — modo de atribuição das limpezas às governantas: RECEPTION (recepção
  // define manualmente quem limpa cada quarto) ou QUEUE (fila geral de quartos sujos, qualquer
  // governanta assume pelo app).
  const [housekeepingAssignmentMode, setHousekeepingAssignmentMode] = useState<"RECEPTION" | "QUEUE">("RECEPTION");
  const [housekeepingSaveError, setHousekeepingSaveError] = useState<string | null>(null);

  // Conexão da instância WhatsApp (uazapi) — tela "Configuração do sistema > API Whatsapp" do
  // sistema legado. Cada assinante conecta uma única instância (servidor + admin token para criar,
  // token da instância para enviar mensagens/ler QR code/status/webhook).
  const [uazServerUrl, setUazServerUrl] = useState("https://api.uazapi.com");
  const [uazAdminToken, setUazAdminToken] = useState("");
  const [uazShowAdminToken, setUazShowAdminToken] = useState(false);
  const [uazInstanceName, setUazInstanceName] = useState("");
  const [uazStatus, setUazStatus] = useState<string>("disconnected");
  const [uazConnected, setUazConnected] = useState(false);
  const [uazQrCodeUrl, setUazQrCodeUrl] = useState<string | null>(null);
  const [uazWebhookUrl, setUazWebhookUrl] = useState("");
  const [uazHasInstance, setUazHasInstance] = useState(false);
  const [uazSaving, setUazSaving] = useState(false);
  const [uazConnecting, setUazConnecting] = useState(false);
  const [uazCheckingStatus, setUazCheckingStatus] = useState(false);
  const [uazDisconnecting, setUazDisconnecting] = useState(false);
  const [uazSavingWebhook, setUazSavingWebhook] = useState(false);
  const [uazStatusMsg, setUazStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Feedback do botão "Conectar WebHook" mostrado logo abaixo dele — uazStatusMsg fica no topo da
  // seção, longe do botão, então sem isso o usuário não via nenhuma resposta ao clicar.
  const [uazWebhookMsg, setUazWebhookMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Vincular instância já existente (criada fora do HoteisNet, ex. direto no painel da uazapi) —
  // não exige admin token, só servidor + token da própria instância.
  const [uazLinkMode, setUazLinkMode] = useState(false);
  const [uazLinkInstanceToken, setUazLinkInstanceToken] = useState("");
  const [uazShowLinkToken, setUazShowLinkToken] = useState(false);
  const [uazLinking, setUazLinking] = useState(false);

  const loadUazapiInstance = () => {
    return fetch("/api/uazapi/instance")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.settings) return;
        const s = data.settings;
        setUazServerUrl(s.serverUrl || "https://api.uazapi.com");
        setUazAdminToken(s.adminToken || "");
        setUazInstanceName(s.instanceName || "");
        setUazStatus(s.status || "disconnected");
        setUazConnected(!!s.connected);
        setUazQrCodeUrl(s.qrCodeUrl || null);
        setUazWebhookUrl(s.webhookUrl || "");
        setUazHasInstance(true);
      })
      .catch(() => {});
  };

  // Enquanto está "connecting" (aguardando leitura do QR code), consulta o status a cada 3s para
  // detectar automaticamente quando o operador escaneia o código no celular.
  useEffect(() => {
    if (uazStatus !== "connecting") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/uazapi/instance/status");
        const data = await res.json();
        if (data.success && data.settings) {
          setUazStatus(data.settings.status || "disconnected");
          setUazConnected(!!data.settings.connected);
          setUazQrCodeUrl(data.settings.qrCodeUrl || null);
        }
      } catch {
        // silencioso — tenta de novo no próximo tick
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [uazStatus]);

  const handleSaveUazapiInstance = async () => {
    setUazSaving(true);
    setUazStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: uazServerUrl, adminToken: uazAdminToken, instanceName: uazInstanceName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazStatusMsg({ type: "error", text: data.error || "Erro ao criar/salvar a instância." });
        return;
      }
      setUazHasInstance(true);
      setUazStatusMsg({ type: "success", text: "Instância criada/salva com sucesso! Clique em Conectar instância para gerar o QR Code." });
    } catch (err: any) {
      setUazStatusMsg({ type: "error", text: err.message || "Erro de rede ao salvar instância." });
    } finally {
      setUazSaving(false);
    }
  };

  const handleConnectUazapiInstance = async () => {
    setUazConnecting(true);
    setUazStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazStatusMsg({ type: "error", text: data.error || "Erro ao conectar instância." });
        return;
      }
      setUazStatus("connecting");
      setUazQrCodeUrl(data.qrCodeUrl || null);
    } catch (err: any) {
      setUazStatusMsg({ type: "error", text: err.message || "Erro de rede ao conectar instância." });
    } finally {
      setUazConnecting(false);
    }
  };

  const handleCheckUazapiStatus = async () => {
    setUazCheckingStatus(true);
    setUazStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance/status");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazStatusMsg({ type: "error", text: data.error || "Erro ao consultar status." });
        return;
      }
      if (data.settings) {
        setUazStatus(data.settings.status || "disconnected");
        setUazConnected(!!data.settings.connected);
        setUazQrCodeUrl(data.settings.qrCodeUrl || null);
      }
    } catch (err: any) {
      setUazStatusMsg({ type: "error", text: err.message || "Erro de rede ao consultar status." });
    } finally {
      setUazCheckingStatus(false);
    }
  };

  const handleDisconnectUazapiInstance = async () => {
    setUazDisconnecting(true);
    setUazStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazStatusMsg({ type: "error", text: data.error || "Erro ao desconectar instância." });
        return;
      }
      setUazStatus("disconnected");
      setUazConnected(false);
      setUazQrCodeUrl(null);
    } catch (err: any) {
      setUazStatusMsg({ type: "error", text: err.message || "Erro de rede ao desconectar instância." });
    } finally {
      setUazDisconnecting(false);
    }
  };

  const handleSaveUazapiWebhook = async () => {
    setUazSavingWebhook(true);
    setUazWebhookMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: uazWebhookUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazWebhookMsg({ type: "error", text: data.error || "Erro ao configurar webhook." });
        return;
      }
      setUazWebhookMsg({ type: "success", text: "Webhook configurado com sucesso!" });
    } catch (err: any) {
      setUazWebhookMsg({ type: "error", text: err.message || "Erro de rede ao configurar webhook." });
    } finally {
      setUazSavingWebhook(false);
    }
  };

  const handleLinkExistingUazapiInstance = async () => {
    setUazLinking(true);
    setUazStatusMsg(null);
    try {
      const res = await fetch("/api/uazapi/instance/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: uazServerUrl, instanceToken: uazLinkInstanceToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUazStatusMsg({ type: "error", text: data.error || "Erro ao vincular instância existente." });
        return;
      }
      setUazHasInstance(true);
      setUazInstanceName(data.settings?.instanceName || "");
      setUazStatus(data.settings?.status || "disconnected");
      setUazConnected(!!data.settings?.connected);
      setUazStatusMsg({ type: "success", text: "Instância vinculada com sucesso!" });
      loadUazapiInstance();
    } catch (err: any) {
      setUazStatusMsg({ type: "error", text: err.message || "Erro de rede ao vincular instância." });
    } finally {
      setUazLinking(false);
    }
  };

  const uazStatusLabel: Record<string, string> = {
    disconnected: "Desconectado",
    connecting: "Aguardando leitura do QR Code...",
    connected: "Conectado",
    hibernated: "Hibernado",
  };

  useEffect(() => {
    const loadTenantSettings = fetch("/api/tenant/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings?.dailyRolloverTime) {
          setDailyRolloverTimeInput(data.settings.dailyRolloverTime);
        }
        if (data.success && typeof data.settings?.allowNegativeStock === "boolean") {
          setAllowNegativeStockInput(data.settings.allowNegativeStock);
        }
        if (data.success) {
          setBreakfastHoursInput(data.settings?.breakfastHours || "");
        }
      })
      .catch(() => {});

    const loadWhatsappMessages = fetch("/api/tenant/whatsapp-messages")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.settings) return;
        const s = data.settings;
        setWaReservaEnabled(!!s.reservationConfirmEnabled);
        setWaReservaMessage(s.reservationConfirmMessage || "");
        setWaCheckinEnabled(!!s.checkinWelcomeEnabled);
        setWaCheckinMessage(s.checkinWelcomeMessage || "");
        setWaPrevisaoEnabled(!!s.checkoutPrevisionEnabled);
        setWaPrevisaoMessage(s.checkoutPrevisionMessage || "");
        setWaPrevisaoTime(s.checkoutPrevisionTime || "10:00");
        setWaCheckoutEnabled(!!s.checkoutEnabled);
        setWaCheckoutMessage(s.checkoutMessage || "");
        setWaPreCheckinEnabled(s.preCheckinFnrhEnabled !== false);
        setWaPreCheckinMessage(s.preCheckinFnrhMessage || "");
        setWaPreCheckinHoursBefore(s.preCheckinFnrhHoursBefore ?? 3);
      })
      .catch(() => {});

    const loadSnrhosSettings = fetch("/api/tenant/snrhos-settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.settings) return;
        const s = data.settings;
        setSnrhosEnvironment(s.environment || "HOMOLOGACAO");
        setSnrhosApiUsername(s.apiUsername || "");
        setSnrhosApiPasswordConfigured(!!s.apiPasswordConfigured);
        setSnrhosCpfSolicitante(s.cpfSolicitante || "");
        setSnrhosEnabled(!!s.enabled);
      })
      .catch(() => {});

    const loadAiAgentSettings = fetch("/api/tenant/ai-agent-settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.settings) return;
        const s = data.settings;
        setAiAgentEnabled(!!s.enabled);
        setAiAgentAutoConfirm(!!s.autoConfirmReservations);
        setAiAgentAllowCancel(!!s.allowAgentCancelReservation);
        setAiAgentDisplayName(s.agentDisplayName || "");
        setAiAgentAvatarUrl(s.agentAvatarUrl || "");
        setAiAgentTonePreset(s.tonePreset || "PROFISSIONAL");
        setAiAgentMonitoringEnabled(!!s.monitoringEnabled);
        setAiAgentAlertPhone(s.alertPhone || "");
        setAiAgentAutonomyMode(s.operationalAutonomyMode || "ALERT_ONLY");
      })
      .catch(() => {});

    const loadHousekeepingSettings = fetch("/api/tenant/housekeeping-settings")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.settings) return;
        setHousekeepingAssignmentMode(data.settings.assignmentMode === "QUEUE" ? "QUEUE" : "RECEPTION");
      })
      .catch(() => {});

    Promise.allSettled([loadUazapiInstance(), loadTenantSettings, loadWhatsappMessages, loadSnrhosSettings, loadAiAgentSettings, loadHousekeepingSettings]).finally(() =>
      setIsLoadingSettings(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calcula o exemplo de expiração com base na tolerância atual
  const exampleCheckInDate = "2026-08-12";
  const exampleCheckInTime = "14:00";
  const tolerancePreviewHours = Number(toleranceInput) || 0;
  const expirationExample = getReservationExpirationDate({
    checkInDate: exampleCheckInDate,
    checkInTime: exampleCheckInTime,
    defaultCheckInTime: "14:00",
    toleranceHours: tolerancePreviewHours,
  });
  const expirationExampleFormatted = formatExpirationLimit(expirationExample);

  const handleSave = async () => {
    setRolloverSaveError(null);
    try {
      const res = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyRolloverTime: dailyRolloverTimeInput,
          allowNegativeStock: allowNegativeStockInput,
          breakfastHours: breakfastHoursInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRolloverSaveError(data.error || "Erro ao salvar configurações do assinante.");
      }
    } catch (err: any) {
      setRolloverSaveError(err.message || "Erro de rede ao salvar horário de virada de diária.");
    }

    setWaSaveError(null);
    try {
      const res = await fetch("/api/tenant/whatsapp-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationConfirmEnabled: waReservaEnabled,
          reservationConfirmMessage: waReservaMessage,
          checkinWelcomeEnabled: waCheckinEnabled,
          checkinWelcomeMessage: waCheckinMessage,
          checkoutPrevisionEnabled: waPrevisaoEnabled,
          checkoutPrevisionMessage: waPrevisaoMessage,
          checkoutPrevisionTime: waPrevisaoTime,
          checkoutEnabled: waCheckoutEnabled,
          checkoutMessage: waCheckoutMessage,
          preCheckinFnrhEnabled: waPreCheckinEnabled,
          preCheckinFnrhMessage: waPreCheckinMessage,
          preCheckinFnrhHoursBefore: waPreCheckinHoursBefore,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setWaSaveError(data.error || "Erro ao salvar mensagens de WhatsApp.");
      }
    } catch (err: any) {
      setWaSaveError(err.message || "Erro de rede ao salvar mensagens de WhatsApp.");
    }

    setSnrhosSaveError(null);
    try {
      const res = await fetch("/api/tenant/snrhos-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: snrhosEnvironment,
          apiUsername: snrhosApiUsername,
          apiPassword: snrhosApiPassword || undefined,
          cpfSolicitante: snrhosCpfSolicitante,
          enabled: snrhosEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSnrhosSaveError(data.error || "Erro ao salvar configurações do SNRHos.");
      } else if (snrhosApiPassword) {
        setSnrhosApiPasswordConfigured(true);
        setSnrhosApiPassword("");
      }
    } catch (err: any) {
      setSnrhosSaveError(err.message || "Erro de rede ao salvar configurações do SNRHos.");
    }

    setAiAgentSaveError(null);
    try {
      const res = await fetch("/api/tenant/ai-agent-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: aiAgentEnabled,
          autoConfirmReservations: aiAgentAutoConfirm,
          allowAgentCancelReservation: aiAgentAllowCancel,
          agentDisplayName: aiAgentDisplayName,
          agentAvatarUrl: aiAgentAvatarUrl,
          tonePreset: aiAgentTonePreset,
          monitoringEnabled: aiAgentMonitoringEnabled,
          alertPhone: aiAgentAlertPhone,
          operationalAutonomyMode: aiAgentAutonomyMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAiAgentSaveError(data.error || "Erro ao salvar configurações do agente de IA.");
      }
    } catch (err: any) {
      setAiAgentSaveError(err.message || "Erro de rede ao salvar configurações do agente de IA.");
    }

    setHousekeepingSaveError(null);
    try {
      const res = await fetch("/api/tenant/housekeeping-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentMode: housekeepingAssignmentMode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setHousekeepingSaveError(data.error || "Erro ao salvar configurações de governança.");
      }
    } catch (err: any) {
      setHousekeepingSaveError(err.message || "Erro de rede ao salvar configurações de governança.");
    }

    setHotelName(inputName);
    setHotelLogo(logoInput.trim() ? logoInput.trim() : null);
    setDefaultCheckInTime(checkInTimeInput);
    setDefaultCheckOutTime(checkOutTimeInput);
    const parsedHours = Math.max(1, Number(toleranceInput) || 24);
    setReservationToleranceHours(parsedHours);

    // Salva parâmetros de e-mail
    setEmailSmtpHost(smtpHostInput.trim());
    setEmailSmtpPort(Number(smtpPortInput) || 587);
    setEmailSmtpSecure(smtpSecureInput);
    setEmailSmtpUser(smtpUserInput.trim());
    setEmailSmtpPass(smtpPassInput.trim());
    setEmailFromName(fromNameInput.trim());
    setEmailFromAddress(fromAddressInput.trim());
    setEmailFooterText(footerTextInput.trim());
    setSendVoucherEmailEnabled(optVoucherInput);
    setSendReceiptEmailEnabled(optReceiptInput);
    setSendPaymentConfirmEmailEnabled(optPaymentInput);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestEmailSmtp = async () => {
    setTestingEmailSmtp(true);
    setEmailTestStatus(null);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost: smtpHostInput,
          smtpPort: Number(smtpPortInput) || 587,
          smtpSecure: smtpSecureInput,
          smtpUser: smtpUserInput,
          smtpPass: smtpPassInput,
          fromName: fromNameInput,
          fromEmail: fromAddressInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailTestStatus({
          success: true,
          message: data.message || "Conexão SMTP com o servidor realizada com sucesso!",
        });
      } else {
        setEmailTestStatus({
          success: false,
          message: data.error || data.message || "Falha na conexão SMTP.",
        });
      }
    } catch (err: any) {
      setEmailTestStatus({
        success: false,
        message: err.message || "Erro de rede ao testar servidor SMTP.",
      });
    } finally {
      setTestingEmailSmtp(false);
    }
  };

  const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/bmp"];
  const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setLogoUploadError(null);

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setLogoUploadError("Formato inválido. Envie uma imagem PNG, JPEG ou BMP.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoUploadError("Arquivo muito grande. O tamanho máximo é 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoInput(reader.result);
      }
    };
    reader.onerror = () => {
      setLogoUploadError("Não foi possível ler o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
  };

  const handleAiAgentAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAiAgentAvatarUploadError(null);

    if (!ACCEPTED_LOGO_TYPES.includes(file.type) && file.type !== "image/webp") {
      setAiAgentAvatarUploadError("Formato inválido. Envie uma imagem PNG, JPEG, WEBP ou BMP.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setAiAgentAvatarUploadError("Arquivo muito grande. O tamanho máximo é 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAiAgentAvatarUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setAiAgentAvatarUploadError("Não foi possível ler o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
  };

  const sampleLogos = [
    { label: "Logo Padrão Sol & Mar", url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=120&auto=format&fit=crop&q=80" },
    { label: "Logo Luxo Gold Hotel", url: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=120&auto=format&fit=crop&q=80" },
    { label: "Logo Boutique Esmeralda", url: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=120&auto=format&fit=crop&q=80" }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <LoadingOverlay show={isLoadingSettings} message="Buscando configurações..." submessage="Estamos carregando as configurações mais recentes do assinante." />

      {/* Top Banner */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border shadow-xl ${theme.bgCard}`}>
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#0284C7] mb-1">
            <Sparkles className="w-4 h-4 text-[#F59E0B]" />
            Personalização & Marca do Assinante
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Configurações do SaaS & Identidade Visual
          </h1>
          <p className={`text-sm mt-1 ${theme.textMuted}`}>
            Escolha o tema de cores do seu sistema (1 escuro e 2 claros) e configure a marca do seu estabelecimento.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#0284C7] to-[#0369A1] text-white font-semibold text-sm shadow-lg shadow-[#0284C7]/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              Salvo com Sucesso!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Configurações
            </>
          )}
        </button>
      </div>

      {/* SECTION 1: Theme & Color Palette Selector */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-[#0284C7]/15 border border-[#0284C7]/30 flex items-center justify-center text-[#0284C7]">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">1. Opções de Temas e Cores (1 Escuro + 2 Claros)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              O tema selecionado e salvo será aplicado instantaneamente em todo o site e aplicativo do assinante.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(Object.keys(THEMES) as ThemeId[]).map((themeKey) => {
            const item = THEMES[themeKey];
            const isSelected = currentTheme === themeKey;

            return (
              <div
                key={item.id}
                onClick={() => setTheme(item.id)}
                className={`group relative cursor-pointer rounded-2xl p-5 border transition-all duration-200 ${
                  isSelected
                    ? "bg-[#0284C7]/10 border-[#0284C7] ring-2 ring-[#0284C7]/40 shadow-xl"
                    : theme.isDark 
                      ? "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                      : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                {/* Active Badge */}
                {isSelected && (
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#10B981] text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 shadow">
                    <Check className="w-3 h-3" /> Ativo
                  </span>
                )}

                {/* Theme Type Badge */}
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2 ${
                  item.isDark ? "bg-slate-800 text-slate-300" : "bg-sky-100 text-sky-800"
                }`}>
                  {item.isDark ? "Modo Escuro (Dark)" : "Modo Claro (Light)"}
                </span>

                {/* Theme Preview Color Pill */}
                <div className={`w-full h-16 rounded-xl bg-gradient-to-r ${item.previewGradient} p-3 flex items-end justify-between shadow-inner mb-4 border border-black/10`}>
                  <span className="text-xs font-mono font-bold text-white drop-shadow">
                    {item.primaryColor}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-white shadow-md inline-block" />
                    <span className="w-4 h-4 rounded-full bg-slate-900 shadow-md inline-block" />
                  </div>
                </div>

                <h3 className="font-bold text-base tracking-tight mb-1">
                  {item.name}
                </h3>
                <p className={`text-xs leading-relaxed mb-4 ${theme.textMuted}`}>
                  {item.description}
                </p>

                {/* UI Element Mock Preview */}
                <div className={`p-3 rounded-xl border space-y-2 ${item.isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">Prévia Visual</span>
                    <span
                      style={{ backgroundColor: item.primaryColor }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                    >
                      Ocupado
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: "70%", backgroundColor: item.accentColor }}
                      className="h-full rounded-full"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Hotel Logo & Branding */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">2. Logo do Hotel (SaaS & Impressões)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Insira o logotipo oficial da sua propriedade para exibição no cabeçalho do SaaS e nos documentos de impressão.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5">
                Nome do Hotel / Pousada
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Ex: Pousada Sol & Mar"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5">
                Horário do Café da Manhã
              </label>
              <div className="relative">
                <Clock3 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={breakfastHoursInput}
                  onChange={(e) => setBreakfastHoursInput(e.target.value)}
                  placeholder="Ex: 07:00 às 10:00"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
              <p className={`text-[10px] mt-1 ${theme.textMuted}`}>Usado pelo Agente de Atendimento para responder o hóspede pelo WhatsApp.</p>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5">
                URL da Imagem do Logo do Hotel
              </label>
              <div className="relative">
                <Upload className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={logoInput}
                  onChange={(e) => setLogoInput(e.target.value)}
                  placeholder="https://exemplo.com/logo-hotel.png"
                  className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>
              <div className="flex items-center gap-3 mt-2">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    theme.isDark
                      ? "bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Enviar do computador
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/bmp,.png,.jpg,.jpeg,.bmp"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </label>
                <span className={`text-[11px] ${theme.textMuted}`}>PNG, JPEG ou BMP (máx. 2MB)</span>
              </div>
              {logoUploadError && (
                <p className="text-[11px] mt-1.5 text-red-500 font-medium">{logoUploadError}</p>
              )}
              <p className={`text-[11px] mt-1.5 ${theme.textMuted}`}>
                Ou selecione um dos logos demonstrativos abaixo:
              </p>
            </div>

            {/* Quick Demo Logos */}
            <div className="flex flex-wrap gap-2">
              {sampleLogos.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => setLogoInput(s.url)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors flex items-center gap-2 ${
                    theme.isDark 
                      ? "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700" 
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                  }`}
                >
                  <img src={s.url} alt="" className="w-4 h-4 rounded object-cover" />
                  {s.label}
                </button>
              ))}
            </div>

            {/* Display Checkbox Options */}
            <div className={`pt-3 border-t space-y-3 ${theme.borderColor}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLogoInHeader}
                  onChange={(e) => setShowLogoInHeader(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-[#0284C7] focus:ring-[#0284C7]"
                />
                <div className="flex items-center gap-2 text-sm">
                  <Layout className="w-4 h-4 text-[#0284C7]" />
                  Exibir logo no cabeçalho do SaaS e Sidebar
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLogoInPrint}
                  onChange={(e) => setShowLogoInPrint(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-[#0284C7] focus:ring-[#0284C7]"
                />
                <div className="flex items-center gap-2 text-sm">
                  <Printer className="w-4 h-4 text-[#10B981]" />
                  Usar logo nos relatórios e documentos de impressão (Extratos, Ficha FNRH)
                </div>
              </label>
            </div>
          </div>

          {/* Logo Live Preview Card */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
            theme.isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${theme.borderColor}`}>
              <span className={`text-xs font-mono font-medium flex items-center gap-1.5 ${theme.textMuted}`}>
                <Eye className="w-4 h-4 text-[#0284C7]" /> Pré-visualização do Logo & Documento
              </span>
              <span className="text-[10px] font-mono text-[#10B981] bg-[#10B981]/15 px-2 py-0.5 rounded border border-[#10B981]/30">
                Ao Vivo
              </span>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-6 rounded-xl bg-slate-900 border border-slate-800/80 text-center space-y-3">
              {logoInput ? (
                <div className="space-y-3">
                  <img
                    src={logoInput}
                    alt="Logo do Hotel"
                    className="max-h-20 max-w-xs mx-auto rounded-lg object-contain shadow-lg border border-slate-700"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="text-sm font-bold text-white block">
                    {inputName || "Sua Propriedade"}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0284C7] to-[#0369A1] mx-auto flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                    {inputName ? inputName.charAt(0) : "H"}
                  </div>
                  <span className="text-sm font-bold text-white block">
                    {inputName || "Nome do Hotel"}
                  </span>
                  <span className="text-xs text-slate-500 block">
                    (Sem logo configurado. Usando avatar padrão com a letra inicial)
                  </span>
                </div>
              )}
            </div>

            {/* Print Mock Header Preview */}
            <div className="p-3 rounded-xl bg-white text-slate-900 space-y-1 text-left text-xs shadow-md">
              <div className="flex items-center justify-between border-b pb-1.5 border-slate-200">
                <div className="flex items-center gap-2">
                  {showLogoInPrint && logoInput ? (
                    <img src={logoInput} alt="" className="h-6 w-auto object-contain" />
                  ) : (
                    <span className="font-bold text-slate-900 text-sm">
                      {inputName || "HOTEL SAAS"}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-500">EXTRATO DE HOSPEDAGEM #8042</span>
              </div>
              <p className="text-[10px] text-slate-600">
                Demonstração do cabeçalho impresso com logo do hotel do assinante.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Standard Check-In / Check-Out Times */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center text-[#10B981]">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">3. Horários Padrão de Check-in e Check-out (Regra de Turno)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Defina os horários pré-configurados da propriedade. O sistema utilizará esses horários para validar turnover no mesmo dia (ex: saída 12:00 x entrada 14:00).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold block">
              Horário Padrão de Check-in (Entrada)
            </label>
            <input
              type="time"
              value={checkInTimeInput}
              onChange={(e) => setCheckInTimeInput(e.target.value)}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            />
            <p className={`text-[11px] ${theme.textMuted}`}>
              Horário pré-definido para início de diárias no mapa de reservas.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold block">
              Horário Padrão de Check-out (Saída)
            </label>
            <input
              type="time"
              value={checkOutTimeInput}
              onChange={(e) => setCheckOutTimeInput(e.target.value)}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            />
            <p className={`text-[11px] ${theme.textMuted}`}>
              Horário limite de término da diária para higienização e turnover.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3.5: Horário de Virada de Diária (Cobrança Automática) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-[#0284C7]/15 border border-[#0284C7]/30 flex items-center justify-center text-[#0284C7]">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Horário de Virada de Diária</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Todos os dias, nesse horário, o sistema soma +1 diária em cada apartamento ainda ocupado.
              O dia do check-in nunca gera virada (a 1ª diária já é lançada no ato do check-in), e no
              momento do check-out só entram as diárias cuja virada já rodou até aquele instante.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold block">
              Horário de Virada de Diária
            </label>
            <input
              type="time"
              value={dailyRolloverTimeInput}
              onChange={(e) => setDailyRolloverTimeInput(e.target.value)}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0284C7] ${
                theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            />
            {rolloverSaveError && (
              <p className="text-[11px] text-red-400">{rolloverSaveError}</p>
            )}
          </div>

          <div className={`p-4 rounded-xl border text-xs font-mono space-y-1 ${
            theme.isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
          }`}>
            <p className="text-[11px] font-semibold text-[#0284C7] uppercase tracking-wider">Exemplo</p>
            <p>Check-in 10/08 14:00, saída 11/08 {dailyRolloverTimeInput} ou depois → 2 diárias.</p>
            <p>Check-in 10/08 14:00, saída 11/08 antes de {dailyRolloverTimeInput} → 1 diária.</p>
          </div>
        </div>
      </div>

      {/* SECTION 3.6: Controle de Estoque (PDV) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500">
            <PackageX className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Controle de Estoque (PDV)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Define o comportamento do sistema ao baixar o estoque de um produto no Lançamento de Consumo do Quarto quando o PDV não tem saldo suficiente.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
          <input
            type="checkbox"
            checked={allowNegativeStockInput}
            onChange={(e) => setAllowNegativeStockInput(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500"
          />
          <div>
            <span className="text-sm font-bold block">Aceita estoque negativo</span>
            <span className={`text-xs ${theme.textMuted}`}>
              {allowNegativeStockInput
                ? "Ativado: o sistema permite baixar o estoque do PDV mesmo sem saldo suficiente (o estoque fica negativo)."
                : "Desativado: o sistema bloqueia o lançamento de consumo quando o PDV não tem estoque suficiente do produto."}
            </span>
          </div>
        </label>
      </div>

      {/* SECTION 3.7: Governança de Quartos — Modo de Atribuição de Limpeza */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Governança de Quartos — Modo de Atribuição de Limpeza</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Define como os quartos a limpar chegam até as governantas no aplicativo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label
            className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-colors ${
              housekeepingAssignmentMode === "RECEPTION"
                ? "border-emerald-500 bg-emerald-500/10"
                : theme.isDark
                  ? "border-slate-800 hover:bg-slate-800/40"
                  : "border-slate-200 hover:bg-slate-100"
            }`}
          >
            <input
              type="radio"
              name="housekeepingAssignmentMode"
              checked={housekeepingAssignmentMode === "RECEPTION"}
              onChange={() => setHousekeepingAssignmentMode("RECEPTION")}
              className="w-4 h-4 mt-0.5 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold">Recepção define</span>
              </div>
              <span className={`text-xs ${theme.textMuted}`}>
                A recepção/gestor atribui manualmente cada quarto a uma governanta específica. No app, cada governanta só vê os quartos que foram atribuídos a ela.
              </span>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border transition-colors ${
              housekeepingAssignmentMode === "QUEUE"
                ? "border-emerald-500 bg-emerald-500/10"
                : theme.isDark
                  ? "border-slate-800 hover:bg-slate-800/40"
                  : "border-slate-200 hover:bg-slate-100"
            }`}
          >
            <input
              type="radio"
              name="housekeepingAssignmentMode"
              checked={housekeepingAssignmentMode === "QUEUE"}
              onChange={() => setHousekeepingAssignmentMode("QUEUE")}
              className="w-4 h-4 mt-0.5 text-emerald-600 focus:ring-emerald-500"
            />
            <div>
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold">Fila de quartos</span>
              </div>
              <span className={`text-xs ${theme.textMuted}`}>
                Os quartos sujos entram numa fila geral. No app, qualquer governanta pode ver a fila e assumir o quarto que for limpar.
              </span>
            </div>
          </label>
        </div>

        {housekeepingSaveError && (
          <p className="text-[11px] text-red-400">{housekeepingSaveError}</p>
        )}
      </div>

      {/* SECTION 4: Configuração de Envio de E-mail (SMTP & Comprovantes por E-mail) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center justify-between border-b pb-4 ${theme.borderColor}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                4. Configuração de Envio de E-mail (SMTP & Comprovantes)
              </h2>
              <p className={`text-xs ${theme.textMuted}`}>
                Configure o servidor SMTP do seu estabelecimento para enviar Vouchers de Reserva, Recibos de Checkout e Confirmações de Pagamento em PDF.
              </p>
            </div>
          </div>

          <button
            onClick={handleTestEmailSmtp}
            disabled={testingEmailSmtp}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-purple-600/20 disabled:opacity-50"
          >
            {testingEmailSmtp ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Testando SMTP...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Testar Conexão de E-mail</span>
              </>
            )}
          </button>
        </div>

        {/* Diagnostic alert message */}
        {emailTestStatus && (
          <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-3 ${
            emailTestStatus.success
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}>
            {emailTestStatus.success ? (
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Mail className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{emailTestStatus.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Servidor SMTP Host & Porta */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Globe className="w-4 h-4" /> Servidor de Saída SMTP
            </h3>

            <div>
              <label className="text-xs font-semibold block mb-1">Servidor SMTP (Host):</label>
              <input
                type="text"
                value={smtpHostInput}
                onChange={(e) => setSmtpHostInput(e.target.value)}
                placeholder="smtp.gmail.com"
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
              <span className={`text-[10px] ${theme.textMuted}`}>Ex: smtp.gmail.com, mail.seuempresa.com.br</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1">Porta SMTP:</label>
                <input
                  type="number"
                  value={smtpPortInput}
                  onChange={(e) => setSmtpPortInput(e.target.value)}
                  placeholder="587"
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-mono text-center font-bold focus:outline-none focus:border-purple-500 ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Segurança:</label>
                <select
                  value={smtpSecureInput}
                  onChange={(e) => setSmtpSecureInput(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-purple-500 ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                >
                  <option value="tls">TLS / STARTTLS (587)</option>
                  <option value="ssl">SSL (465)</option>
                  <option value="none">Nenhuma (25)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Autenticação SMTP */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Autenticação do Usuário
            </h3>

            <div>
              <label className="text-xs font-semibold block mb-1">Usuário / E-mail de Envio:</label>
              <input
                type="text"
                value={smtpUserInput}
                onChange={(e) => setSmtpUserInput(e.target.value)}
                placeholder="reserva@pousada.com.br"
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">Senha SMTP / App Password:</label>
              <div className="relative">
                <input
                  type={showEmailPass ? "text" : "password"}
                  value={smtpPassInput}
                  onChange={(e) => setSmtpPassInput(e.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full border rounded-xl pl-3 pr-10 py-2 text-xs font-mono focus:outline-none focus:border-purple-500 ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowEmailPass(!showEmailPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showEmailPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className={`text-[10px] ${theme.textMuted}`}>Para o Gmail, utilize Senha de App de 16 caracteres.</span>
            </div>
          </div>

          {/* Remetente & Rodapé Personalizado */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <Building className="w-4 h-4" /> Remetente & Rodapé
            </h3>

            <div>
              <label className="text-xs font-semibold block mb-1">Nome de Exibição do Remetente:</label>
              <input
                type="text"
                value={fromNameInput}
                onChange={(e) => setFromNameInput(e.target.value)}
                placeholder="Pousada Sol & Mar - Atendimento"
                className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">E-mail do Remetente (From):</label>
              <input
                type="email"
                value={fromAddressInput}
                onChange={(e) => setFromAddressInput(e.target.value)}
                placeholder="reserva@pousada.com.br"
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Rodapé e Opções de Disparo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
          <div>
            <label className="text-xs font-semibold block mb-1">Texto do Rodapé Personalizado nos E-mails:</label>
            <textarea
              rows={3}
              value={footerTextInput}
              onChange={(e) => setFooterTextInput(e.target.value)}
              placeholder="Obrigado por escolher a Pousada Sol & Mar! Em caso de dúvidas, entre em contato conosco."
              className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-purple-500 ${
                theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
              }`}
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold block mb-1">Permissões de Envio por E-mail no Sistema:</label>

            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={optVoucherInput}
                onChange={(e) => setOptVoucherInput(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="text-xs font-bold text-white block">Envio de Voucher de Reserva por E-mail</span>
                <span className={`text-[10px] ${theme.textMuted}`}>Permite disparar comprovantes e vouchers em PDF ao criar ou visualizar reservas.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={optReceiptInput}
                onChange={(e) => setOptReceiptInput(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="text-xs font-bold text-white block">Envio de Extrato e Recibo de Checkout por E-mail</span>
                <span className={`text-[10px] ${theme.textMuted}`}>Permite disparar extratos de consumos e tarifas do quarto por e-mail.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
              <input
                type="checkbox"
                checked={optPaymentInput}
                onChange={(e) => setOptPaymentInput(e.target.checked)}
                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <div>
                <span className="text-xs font-bold text-white block">Envio de Confirmação de Pagamento por E-mail</span>
                <span className={`text-[10px] ${theme.textMuted}`}>Permite enviar comprovante imediato ao receber adiantamentos ou quitação no caixa.</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION 5: Tolerância de Validade de Reservas (No-Show / Expiração Automática) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500">
            <TimerOff className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              5. Tolerância de Validade de Reservas (No-Show / Expiração)
            </h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Define quantas horas após o horário de check-in uma reserva sem atendimento (no-show) permanece ativa antes de ser automaticamente cancelada/removida do sistema.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Input + Presets */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1.5 flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5 text-orange-400" />
                Horas de Tolerância (após horário de check-in)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={toleranceInput}
                  onChange={(e) => setToleranceInput(e.target.value)}
                  placeholder="24"
                  className={`w-32 border rounded-xl px-4 py-2.5 text-sm text-center font-bold focus:outline-none focus:border-orange-500 ${
                    theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                  }`}
                />
                <span className={`text-sm ${theme.textMuted}`}>horas</span>
              </div>
              <p className={`text-[11px] mt-1.5 ${theme.textMuted}`}>
                Valor mínimo: 1 hora. Valor máximo: 720 horas (30 dias). Recomendado: 24 horas.
              </p>
            </div>

            {/* Presets rápidos */}
            <div>
              <label className={`text-xs font-semibold block mb-2 ${theme.textMuted}`}>Presets Rápidos:</label>
              <div className="flex flex-wrap gap-2">
                {[2, 6, 12, 24, 48, 72].map((h) => (
                  <button
                    key={h}
                    onClick={() => setToleranceInput(String(h))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      toleranceInput === String(h)
                        ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
                        : theme.isDark
                        ? "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border-slate-700"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview dinâmico da regra */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            theme.isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-orange-400 shrink-0" />
              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Prévia da Regra (Exemplo)</span>
            </div>

            <div className={`text-xs space-y-2 font-mono ${
              theme.isDark ? "text-slate-300" : "text-slate-700"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Check-in previsto:</span>
                <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded">12/08/2026 às 14:00</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Tolerância:</span>
                <span className="font-bold text-orange-400">{tolerancePreviewHours}h</span>
              </div>
              <div className={`mt-3 p-3 rounded-xl border ${
                theme.isDark ? "bg-orange-950/30 border-orange-500/30" : "bg-orange-50 border-orange-300"
              }`}>
                <p className="text-[11px] text-orange-400 font-semibold mb-1">⏱ Reserva cai automaticamente em:</p>
                <p className="text-sm font-bold text-orange-300">
                  {expirationExampleFormatted || "—"}
                </p>
              </div>
              <p className={`text-[10px] leading-relaxed mt-2 ${
                theme.isDark ? "text-slate-500" : "text-slate-500"
              }`}>
                Reservas com status <strong>CHECKED_IN</strong> (hóspede presente) nunca são removidas por esta regra.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 6: Mensagens Automáticas de WhatsApp (Painel de Configurações de Mensagens) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">6. Mensagens Automáticas de WhatsApp</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Defina se, após cada operação (reserva, check-in, previsão de check-out e check-out), o sistema envia automaticamente uma mensagem de WhatsApp para o hóspede — e o texto de cada mensagem.
            </p>
          </div>
        </div>

        {waSaveError && (
          <div className="p-3 rounded-xl border text-xs font-semibold bg-red-950/40 border-red-500/40 text-red-300">
            {waSaveError}
          </div>
        )}

        <div className="space-y-5">
          {/* Confirmação de reserva */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={waReservaEnabled}
                onClick={() => setWaReservaEnabled(!waReservaEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${waReservaEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${waReservaEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Confirmação de reserva
              </div>
            </div>
            <div className="flex-1">
              <textarea
                rows={2}
                value={waReservaMessage}
                onChange={(e) => setWaReservaMessage(e.target.value)}
                disabled={!waReservaEnabled}
                placeholder="Foi efetuado uma reserva. Segue anexo o PDF com o voucher."
                className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className={`text-[10px] mt-1 ${theme.textMuted}`}>
                Enviada com o voucher em PDF anexo, ao confirmar uma nova reserva.
              </p>
            </div>
          </div>

          {/* Mensagem de boas-vindas (Check-in) */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={waCheckinEnabled}
                onClick={() => setWaCheckinEnabled(!waCheckinEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${waCheckinEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${waCheckinEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <PartyPopper className="w-3.5 h-3.5 text-emerald-500" />
                Boas-vindas (Check-in)
              </div>
            </div>
            <div className="flex-1">
              <textarea
                rows={4}
                value={waCheckinMessage}
                onChange={(e) => setWaCheckinMessage(e.target.value)}
                disabled={!waCheckinEnabled}
                placeholder="*Bem-vindo(a) ao {HOTEL}!* Wi-Fi: rede X, senha Y..."
                className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className={`text-[10px] mt-1 ${theme.textMuted}`}>
                Enviada ao hóspede assim que o check-in é efetivado. Use {"{HOSPEDE}"}, {"{HOTEL}"} e {"{QUARTO}"} — são substituídos automaticamente. Ideal para senha de Wi-Fi, horários de café da manhã, etc.
              </p>
            </div>
          </div>

          {/* Mensagem de pré-check-in FNRH */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={waPreCheckinEnabled}
                onClick={() => setWaPreCheckinEnabled(!waPreCheckinEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${waPreCheckinEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${waPreCheckinEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Pré-Check-in FNRH
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <textarea
                rows={3}
                value={waPreCheckinMessage}
                onChange={(e) => setWaPreCheckinMessage(e.target.value)}
                disabled={!waPreCheckinEnabled}
                placeholder="Olá {HOSPEDE}! Faltam poucas horas para sua chegada ao {HOTEL}. Preencha seus dados no link: {LINK}"
                className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold">Enviar quantas horas antes do check-in:</label>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={waPreCheckinHoursBefore}
                  onChange={(e) => setWaPreCheckinHoursBefore(Math.max(1, Number(e.target.value) || 1))}
                  disabled={!waPreCheckinEnabled}
                  className={`w-20 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
              <p className={`text-[10px] ${theme.textMuted}`}>
                Enviada automaticamente com o link para o hóspede preencher a Ficha Nacional de Registro de Hóspedes
                (FNRH) antes de chegar. Use {"{HOSPEDE}"}, {"{HOTEL}"} e {"{LINK}"} — são substituídos
                automaticamente. Pode também ser disparada manualmente na Grade de Reservas.
              </p>
            </div>
          </div>

          {/* Mensagem de previsão de checkout */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={waPrevisaoEnabled}
                onClick={() => setWaPrevisaoEnabled(!waPrevisaoEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${waPrevisaoEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${waPrevisaoEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <BellRing className="w-3.5 h-3.5 text-emerald-500" />
                Previsão de checkout
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <textarea
                rows={2}
                value={waPrevisaoMessage}
                onChange={(e) => setWaPrevisaoMessage(e.target.value)}
                disabled={!waPrevisaoEnabled}
                placeholder="Olá {HOSPEDE}, lembramos que o check-out do quarto {QUARTO} está previsto para hoje."
                className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold">Hora do disparo:</label>
                <input
                  type="time"
                  value={waPrevisaoTime}
                  onChange={(e) => setWaPrevisaoTime(e.target.value)}
                  disabled={!waPrevisaoEnabled}
                  className={`border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
              <p className={`text-[10px] ${theme.textMuted}`}>
                Enviada automaticamente, uma vez por dia no horário acima, a todos os hóspedes com check-out previsto para o dia e reserva confirmada.
              </p>
            </div>
          </div>

          {/* Mensagem de checkout */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={waCheckoutEnabled}
                onClick={() => setWaCheckoutEnabled(!waCheckoutEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${waCheckoutEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${waCheckoutEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <LogOut className="w-3.5 h-3.5 text-emerald-500" />
                Mensagem de checkout
              </div>
            </div>
            <div className="flex-1">
              <textarea
                rows={2}
                value={waCheckoutMessage}
                onChange={(e) => setWaCheckoutMessage(e.target.value)}
                disabled={!waCheckoutEnabled}
                placeholder="Checkout feito com sucesso. Esperamos que seja breve o seu retorno."
                className={`w-full border rounded-xl p-3 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className={`text-[10px] mt-1 ${theme.textMuted}`}>
                Enviada ao hóspede assim que o check-out é confirmado no sistema.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 7: API Whatsapp (Conexão da Instância uazapi) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">7. API Whatsapp (Conexão da Instância)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Conecte o número de WhatsApp do seu estabelecimento via uazapi. É pré-requisito para enviar mensagens, resumos, extratos e comprovantes de consumo pela tela do quarto ocupado.
            </p>
          </div>
        </div>

        {uazStatusMsg && (
          <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-3 ${
            uazStatusMsg.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}>
            {uazStatusMsg.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold block mb-1">Servidor API:</label>
              <input
                type="text"
                value={uazServerUrl}
                onChange={(e) => setUazServerUrl(e.target.value)}
                placeholder="https://api.uazapi.com"
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
            </div>

            <div className="flex rounded-xl overflow-hidden border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setUazLinkMode(false)}
                className={`flex-1 px-3 py-2 transition-colors ${!uazLinkMode ? "bg-emerald-600 text-white" : theme.isDark ? "bg-slate-900 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
              >
                Criar nova instância
              </button>
              <button
                type="button"
                onClick={() => setUazLinkMode(true)}
                className={`flex-1 px-3 py-2 transition-colors ${uazLinkMode ? "bg-emerald-600 text-white" : theme.isDark ? "bg-slate-900 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}
              >
                Já tenho uma instância
              </button>
            </div>

            {uazLinkMode ? (
              <>
                <div>
                  <label className="text-xs font-semibold block mb-1">Instance Token (token da instância já criada):</label>
                  <div className="relative">
                    <input
                      type={uazShowLinkToken ? "text" : "password"}
                      value={uazLinkInstanceToken}
                      onChange={(e) => setUazLinkInstanceToken(e.target.value)}
                      placeholder="Ex: fbe5bfbb-226a-47a2-9d1d-6b657933318c"
                      className={`w-full border rounded-xl pl-3 pr-10 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setUazShowLinkToken(!uazShowLinkToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {uazShowLinkToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className={`text-[11px] mt-1.5 ${theme.textMuted}`}>
                    Encontrado no painel da uazapi em "Dados da instância" → Instance Token. Não precisa do Admin Token para vincular — só para criar instâncias novas.
                  </p>
                </div>

                <button
                  onClick={handleLinkExistingUazapiInstance}
                  disabled={uazLinking || !uazServerUrl || !uazLinkInstanceToken}
                  className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <PlugZap className="w-3.5 h-3.5" />
                  {uazLinking ? "Vinculando..." : "Vincular Instância Existente"}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold block mb-1">Chave/Token Adm/Conexão:</label>
                  <div className="relative">
                    <input
                      type={uazShowAdminToken ? "text" : "password"}
                      value={uazAdminToken}
                      onChange={(e) => setUazAdminToken(e.target.value)}
                      placeholder="Token administrativo da uazapi"
                      className={`w-full border rounded-xl pl-3 pr-10 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                        theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setUazShowAdminToken(!uazShowAdminToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {uazShowAdminToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Nome da instância:</label>
                  <input
                    type="text"
                    value={uazInstanceName}
                    onChange={(e) => setUazInstanceName(e.target.value)}
                    placeholder="Ex: recepcao-hotel"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                      theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <button
                  onClick={handleSaveUazapiInstance}
                  disabled={uazSaving || !uazServerUrl || !uazAdminToken || !uazInstanceName}
                  className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {uazSaving ? "Salvando..." : uazHasInstance ? "Salvar / Recriar Instância" : "Criar Instância"}
                </button>
              </>
            )}

            <div className={`pt-3 border-t space-y-2 ${theme.borderColor}`}>
              <label className="text-xs font-semibold block mb-1 flex items-center gap-1.5">
                <Webhook className="w-3.5 h-3.5 text-emerald-500" /> URL WebHook:
              </label>
              <input
                type="text"
                value={uazWebhookUrl}
                onChange={(e) => setUazWebhookUrl(e.target.value)}
                placeholder={typeof window !== "undefined" ? `${window.location.origin}/api/uazapi/webhook/tenant-hoteisnet-demo` : "https://seusite.com/api/uazapi/webhook/<tenantId>"}
                className={`w-full border rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                  theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"
                }`}
              />
              <p className={`text-[11px] ${theme.textMuted}`}>
                É essa URL que a uazapi vai chamar quando o hóspede responder uma mensagem. Em produção, use o domínio público do seu HoteisNet (não funciona com localhost).
              </p>
              <button
                onClick={handleSaveUazapiWebhook}
                disabled={uazSavingWebhook || !uazHasInstance || !uazWebhookUrl}
                className={`w-full px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
                  theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                }`}
              >
                {uazSavingWebhook ? "Salvando..." : "Conectar WebHook"}
              </button>
              {uazWebhookMsg && (
                <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${uazWebhookMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                  {uazWebhookMsg.type === "success" ? <Check className="w-3.5 h-3.5" /> : null}
                  {uazWebhookMsg.text}
                </p>
              )}
            </div>

            <div className={`pt-3 border-t ${theme.borderColor}`}>
              <label className="flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-emerald-500" />
                  <div>
                    <span className="text-xs font-bold block">Som ao receber mensagem do hóspede</span>
                    <span className={`text-[10px] ${theme.textMuted}`}>Toca um sinal sonoro quando chega mensagem e a tela de conversa não está aberta.</span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={whatsappSoundEnabled}
                  onClick={() => setWhatsappSoundEnabled(!whatsappSoundEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${whatsappSoundEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
                >
                  <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${whatsappSoundEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </label>
              <button
                onClick={() => playWhatsappNotificationSound()}
                className={`mt-2 w-full px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                }`}
              >
                Testar som
              </button>

              <label className="flex items-center justify-between gap-3 cursor-pointer p-3 mt-2 rounded-xl border border-slate-800 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="text-xs font-bold block">Som de intervenção humana (agentes de IA)</span>
                    <span className={`text-[10px] ${theme.textMuted}`}>Toca um alerta sonoro diferente quando o Agente de Atendimento ou o Agente Operacional precisar de um humano — aparece no Mapa de Quartos e Mapa de Reservas.</span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={humanInterventionSoundEnabled}
                  onClick={() => setHumanInterventionSoundEnabled(!humanInterventionSoundEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${humanInterventionSoundEnabled ? "bg-amber-500" : "bg-slate-600"}`}
                >
                  <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${humanInterventionSoundEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </label>
              <button
                onClick={() => playHumanInterventionSound()}
                className={`mt-2 w-full px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                }`}
              >
                Testar som de intervenção
              </button>
            </div>
          </div>

          <div className={`p-5 rounded-2xl border flex flex-col items-center gap-4 ${
            theme.isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex items-center justify-between w-full">
              <span className={`text-xs font-mono font-medium ${theme.textMuted}`}>Status da conexão</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                uazConnected
                  ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                  : uazStatus === "connecting"
                  ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                  : "text-slate-400 bg-slate-500/15 border-slate-500/30"
              }`}>
                {uazStatusLabel[uazStatus] || uazStatus}
              </span>
            </div>

            <div className={`w-56 h-56 rounded-xl border flex items-center justify-center overflow-hidden ${
              theme.isDark ? "bg-white border-slate-700" : "bg-white border-slate-300"
            }`}>
              {uazQrCodeUrl ? (
                <img src={uazQrCodeUrl} alt="QR Code de conexão WhatsApp" className="w-full h-full object-contain" />
              ) : uazConnected ? (
                <div className="flex flex-col items-center gap-2 text-emerald-600">
                  <PlugZap className="w-12 h-12" />
                  <span className="text-xs font-bold">Conectado</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <QrCode className="w-12 h-12" />
                  <span className="text-[11px] text-center px-4">Clique em "Conectar instância" para gerar o QR Code</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 w-full">
              <button
                onClick={handleConnectUazapiInstance}
                disabled={uazConnecting || !uazHasInstance || uazConnected}
                className="w-full px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <PlugZap className="w-3.5 h-3.5" /> {uazConnecting ? "Conectando..." : "Conectar instância"}
              </button>
              <button
                onClick={handleCheckUazapiStatus}
                disabled={uazCheckingStatus || !uazHasInstance}
                className={`w-full px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  theme.isDark ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> {uazCheckingStatus ? "Consultando..." : "Status da instância"}
              </button>
              <button
                onClick={handleDisconnectUazapiInstance}
                disabled={uazDisconnecting || !uazHasInstance || !uazConnected}
                className="w-full px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Unplug className="w-3.5 h-3.5" /> {uazDisconnecting ? "Desconectando..." : "Desconectar instância"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 8: SNRHos (Transmissão eletrônica da FNRH ao Ministério do Turismo) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">SNRHos (FNRH Digital — Ministério do Turismo)</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Credenciais para transmitir eletronicamente a Ficha Nacional de Registro de Hóspedes ao governo federal.
            </p>
          </div>
        </div>

        {snrhosSaveError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{snrhosSaveError}</div>
        )}

        <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={snrhosEnabled}
              onClick={() => setSnrhosEnabled(!snrhosEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${snrhosEnabled ? "bg-emerald-500" : "bg-slate-600"}`}
            >
              <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${snrhosEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Transmissão ativa
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Ambiente</label>
                <select
                  value={snrhosEnvironment}
                  onChange={(e) => setSnrhosEnvironment(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                >
                  <option value="HOMOLOGACAO">Homologação (testes)</option>
                  <option value="PRODUCAO">Produção</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">CPF do responsável (cpf_solicitante)</label>
                <input
                  value={snrhosCpfSolicitante}
                  onChange={(e) => setSnrhosCpfSolicitante(e.target.value)}
                  placeholder="000.000.000-00"
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Usuário da API (Chave das API's)</label>
                <input
                  value={snrhosApiUsername}
                  onChange={(e) => setSnrhosApiUsername(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Chave de acesso {snrhosApiPasswordConfigured && <span className="text-emerald-500">(já configurada)</span>}
                </label>
                <input
                  type="password"
                  value={snrhosApiPassword}
                  onChange={(e) => setSnrhosApiPassword(e.target.value)}
                  placeholder={snrhosApiPasswordConfigured ? "•••••••• (deixe em branco para manter)" : "Colar a chave gerada no portal FNRH"}
                  className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
            </div>
            <p className={`text-[10px] ${theme.textMuted}`}>
              Gere o Usuário e a Chave em{" "}
              <span className="font-mono">fnrh.turismo.serpro.gov.br/FNRH_SRH</span> → menu → "Chave das API's" (login
              gov.br com o CPF vinculado ao Cadastur do hotel). Enquanto "Transmissão ativa" estiver desligado, nenhum
              dado é enviado ao governo — o pré-check-in continua funcionando normalmente.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 9: Agente de IA (atendimento via WhatsApp + monitoramento) */}
      <div className={`rounded-2xl border p-6 space-y-6 shadow-lg ${theme.bgCard}`}>
        <div className={`flex items-center gap-3 border-b pb-4 ${theme.borderColor}`}>
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Agente de IA</h2>
            <p className={`text-xs ${theme.textMuted}`}>
              Atendimento automático de dúvidas dos hóspedes pelo WhatsApp e alertas de monitoramento operacional.
            </p>
          </div>
        </div>

        {aiAgentSaveError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">{aiAgentSaveError}</div>
        )}

        <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={aiAgentEnabled}
              onClick={() => setAiAgentEnabled(!aiAgentEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${aiAgentEnabled ? "bg-violet-500" : "bg-slate-600"}`}
            >
              <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${aiAgentEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              Atendimento por IA
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={aiAgentAutoConfirm}
                onChange={(e) => setAiAgentAutoConfirm(e.target.checked)}
                className="w-4 h-4 accent-violet-500"
              />
              Reserva feita pelo agente entra já confirmada (sem isso, entra como pré-reserva pendente de confirmação da recepção)
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={aiAgentAllowCancel}
                onChange={(e) => setAiAgentAllowCancel(e.target.checked)}
                className="w-4 h-4 accent-violet-500"
              />
              Permitir que o agente cancele reservas a pedido do hóspede (cancelamento reversível — nunca de hospedagem com check-in já feito, isso sempre vai para a recepção)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Nome do agente no WhatsApp</label>
                <input
                  value={aiAgentDisplayName}
                  onChange={(e) => setAiAgentDisplayName(e.target.value)}
                  placeholder="Ex: Sofia"
                  className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Foto de perfil do agente</label>
                <div className="flex items-center gap-2">
                  {aiAgentAvatarUrl ? (
                    <img src={aiAgentAvatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-700 shrink-0" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-500 text-xs font-bold shrink-0">
                      {aiAgentDisplayName ? aiAgentDisplayName.charAt(0).toUpperCase() : "A"}
                    </div>
                  )}
                  <input
                    value={aiAgentAvatarUrl}
                    onChange={(e) => setAiAgentAvatarUrl(e.target.value)}
                    placeholder="https://... ou envie do computador"
                    className={`flex-1 border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
                  />
                  <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors shrink-0 ${
                    theme.isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300"
                  }`}>
                    <Upload className="w-3.5 h-3.5" />
                    Enviar
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      onChange={handleAiAgentAvatarFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                {aiAgentAvatarUploadError && (
                  <p className="text-[11px] text-red-500 font-medium">{aiAgentAvatarUploadError}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Tom de conversa</label>
              <select
                value={aiAgentTonePreset}
                onChange={(e) => setAiAgentTonePreset(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              >
                <option value="FORMAL">Formal</option>
                <option value="PROFISSIONAL">Profissional</option>
                <option value="DESCONTRAIDO">Descontraído</option>
                <option value="DIRETO">Direto</option>
              </select>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${theme.isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex md:flex-col items-center md:items-start gap-2 md:w-40 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={aiAgentMonitoringEnabled}
              onClick={() => setAiAgentMonitoringEnabled(!aiAgentMonitoringEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${aiAgentMonitoringEnabled ? "bg-violet-500" : "bg-slate-600"}`}
            >
              <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${aiAgentMonitoringEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <BellRing className="w-3.5 h-3.5 text-violet-500" />
              Monitoramento
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Telefone WhatsApp para alertas</label>
              <input
                value={aiAgentAlertPhone}
                onChange={(e) => setAiAgentAlertPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                className={`w-full border rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-violet-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              />
              <p className={`text-[10px] ${theme.textMuted}`}>
                Quando algo precisar de atenção (ex: envio da FNRH travado), o agente manda um resumo para este número.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold">Autonomia do agente operacional</label>
              <select
                value={aiAgentAutonomyMode}
                onChange={(e) => setAiAgentAutonomyMode(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-violet-500 ${theme.isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900"}`}
              >
                <option value="ALERT_ONLY">Só alertar (recomendado)</option>
                <option value="AUTONOMOUS_LIMITED">Agir sozinho em casos simples, com aviso</option>
              </select>
              <p className={`text-[10px] ${theme.textMuted}`}>
                "Agir sozinho" ainda está em desenvolvimento — por enquanto o agente sempre só alerta, mesmo com essa opção marcada.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Action Footer - sempre visível, fixo na última linha da área de conteúdo */}
      <div className={`sticky bottom-0 z-20 flex items-center justify-between p-4 rounded-xl border shadow-[0_-4px_16px_rgba(0,0,0,0.2)] ${theme.bgCard}`}>
        <div className={`flex items-center gap-2 text-xs ${theme.textMuted}`}>
          <ShieldCheck className="w-4 h-4 text-[#10B981]" />
          As configurações são salvas instantaneamente e aplicadas em todo o site.
        </div>
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-[#0284C7] text-white font-semibold text-sm hover:bg-[#0369A1] transition-colors flex items-center gap-2"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              Salvo com Sucesso!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Salvar Alterações
            </>
          )}
        </button>
      </div>
    </div>
  );
}
