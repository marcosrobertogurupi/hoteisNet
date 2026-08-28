"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type ThemeId = "dark" | "light-white" | "light-blue";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  isDark: boolean;
  primaryColor: string;
  accentColor: string;
  bgApp: string;
  bgHeader: string;
  bgSidebar: string;
  bgCard: string;
  borderColor: string;
  textMain: string;
  textMuted: string;
  badgeBg: string;
  previewGradient: string;
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  dark: {
    id: "dark",
    name: "Dark Moderno (Escuro Tech)",
    description: "Design escuro corporativo com fundo #090D16 e texto claro. Ideal para baixa iluminação.",
    isDark: true,
    primaryColor: "#0284C7",
    accentColor: "#38BDF8",
    bgApp: "bg-[#090D16]",
    bgHeader: "bg-[#0F172A] border-slate-800 text-white",
    bgSidebar: "bg-[#0F172A] border-slate-800 text-white",
    bgCard: "bg-[#0F172A] border-slate-800 text-white",
    borderColor: "border-slate-800",
    textMain: "text-white",
    textMuted: "text-slate-400",
    badgeBg: "bg-[#0284C7]/20 text-[#38BDF8] border-[#0284C7]/40",
    previewGradient: "from-[#0F172A] via-[#1E293B] to-[#0284C7]",
  },
  "light-white": {
    id: "light-white",
    name: "Claro Branco (White Clean)",
    description: "Design claro minimalista: Fundo e sidebar brancos (#FFFFFF) com texto escuro (#0F172A) e máxima legibilidade.",
    isDark: false,
    primaryColor: "#0284C7",
    accentColor: "#0369A1",
    bgApp: "bg-[#F8FAFC]",
    bgHeader: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgSidebar: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgCard: "bg-white border-slate-200 text-slate-900 shadow-sm",
    borderColor: "border-slate-200",
    textMain: "text-slate-900",
    textMuted: "text-slate-600",
    badgeBg: "bg-[#0284C7]/15 text-[#0284C7] border-[#0284C7]/30",
    previewGradient: "from-white via-[#E0F2FE] to-[#0284C7]",
  },
  "light-blue": {
    id: "light-blue",
    name: "Claro Foco (Branco & Azul Real)",
    description: "Design executivo FOCO: Fundo claro (#F1F5F9), sidebar em Azul Real (#34598F) e cards brancos com texto escuro.",
    isDark: false,
    primaryColor: "#34598F",
    accentColor: "#F59E0B",
    bgApp: "bg-[#F1F5F9]",
    bgHeader: "bg-white border-slate-200 text-slate-900 shadow-sm",
    bgSidebar: "bg-[#34598F] border-slate-700 text-white shadow-xl",
    bgCard: "bg-white border-slate-200 text-slate-900 shadow-sm",
    borderColor: "border-slate-200",
    textMain: "text-slate-900",
    textMuted: "text-slate-600",
    badgeBg: "bg-[#34598F]/10 text-[#34598F] border-[#34598F]/30",
    previewGradient: "from-[#34598F] via-[#3B629B] to-slate-100",
  },
};

export interface ThemeContextType {
  currentTheme: ThemeId;
  theme: ThemeConfig;
  setTheme: (themeId: ThemeId) => void;
  hotelLogo: string | null;
  setHotelLogo: (logoUrl: string | null) => void;
  hotelName: string;
  setHotelName: (name: string) => void;
  showLogoInHeader: boolean;
  setShowLogoInHeader: (val: boolean) => void;
  showLogoInPrint: boolean;
  setShowLogoInPrint: (val: boolean) => void;
  defaultCheckInTime: string;
  setDefaultCheckInTime: (time: string) => void;
  defaultCheckOutTime: string;
  setDefaultCheckOutTime: (time: string) => void;
  // Tolerância (minutos antes do horário padrão de check-in) sem cobrança de chegada antecipada.
  earlyCheckinToleranceMinutes: number;
  // Cobrança padrão pré-selecionada no painel de decisão de chegada (EXTRA_NIGHT | HALF_NIGHT | FIXED_FEE).
  earlyArrivalDefaultCharge: string;
  overnightArrivalDefaultCharge: string;
  earlyCheckinFixedFeeAmount: number;
  uazapiServerUrl: string;
  setUazapiServerUrl: (url: string) => void;
  uazapiInstanceToken: string;
  setUazapiInstanceToken: (token: string) => void;
  whatsappSoundEnabled: boolean;
  setWhatsappSoundEnabled: (val: boolean) => void;
  humanInterventionSoundEnabled: boolean;
  setHumanInterventionSoundEnabled: (val: boolean) => void;
  reservationToleranceHours: number;
  setReservationToleranceHours: (hours: number) => void;

  // Envio de E-mail / SMTP
  emailSmtpHost: string;
  setEmailSmtpHost: (host: string) => void;
  emailSmtpPort: number;
  setEmailSmtpPort: (port: number) => void;
  emailSmtpSecure: string; // "tls" | "ssl" | "none"
  setEmailSmtpSecure: (sec: string) => void;
  emailSmtpUser: string;
  setEmailSmtpUser: (user: string) => void;
  emailSmtpPass: string;
  setEmailSmtpPass: (pass: string) => void;
  emailFromName: string;
  setEmailFromName: (name: string) => void;
  emailFromAddress: string;
  setEmailFromAddress: (email: string) => void;
  emailFooterText: string;
  setEmailFooterText: (text: string) => void;
  sendVoucherEmailEnabled: boolean;
  setSendVoucherEmailEnabled: (val: boolean) => void;
  sendReceiptEmailEnabled: boolean;
  setSendReceiptEmailEnabled: (val: boolean) => void;
  sendPaymentConfirmEmailEnabled: boolean;
  setSendPaymentConfirmEmailEnabled: (val: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentThemeState] = useState<ThemeId>("dark");
  const [hotelLogo, setHotelLogoState] = useState<string | null>(null);
  const [hotelName, setHotelNameState] = useState<string>("Pousada Sol & Mar");
  const [showLogoInHeader, setShowLogoInHeaderState] = useState<boolean>(true);
  const [showLogoInPrint, setShowLogoInPrintState] = useState<boolean>(true);
  const [defaultCheckInTime, setDefaultCheckInTimeState] = useState<string>("14:00");
  const [defaultCheckOutTime, setDefaultCheckOutTimeState] = useState<string>("12:00");
  const [earlyCheckinToleranceMinutes, setEarlyCheckinToleranceMinutesState] = useState<number>(60);
  const [earlyArrivalDefaultCharge, setEarlyArrivalDefaultChargeState] = useState<string>("EXTRA_NIGHT");
  const [overnightArrivalDefaultCharge, setOvernightArrivalDefaultChargeState] = useState<string>("EXTRA_NIGHT");
  const [earlyCheckinFixedFeeAmount, setEarlyCheckinFixedFeeAmountState] = useState<number>(0);

  // Uazapi Integration default values (Subscriber settings, customizable per tenant)
  const [uazapiServerUrl, setUazapiServerUrlState] = useState<string>("https://netservice.uazapi.com");
  const [uazapiInstanceToken, setUazapiInstanceTokenState] = useState<string>("fbe5bfbb-226a-47a2-9d1d-6b657933318c");
  const [whatsappSoundEnabled, setWhatsappSoundEnabledState] = useState<boolean>(true);
  const [humanInterventionSoundEnabled, setHumanInterventionSoundEnabledState] = useState<boolean>(true);

  // Tolerância de Reserva
  const [reservationToleranceHours, setReservationToleranceHoursState] = useState<number>(24);

  // Parâmetros de E-mail / SMTP do Assinante
  const [emailSmtpHost, setEmailSmtpHostState] = useState<string>("smtp.gmail.com");
  const [emailSmtpPort, setEmailSmtpPortState] = useState<number>(587);
  const [emailSmtpSecure, setEmailSmtpSecureState] = useState<string>("tls");
  const [emailSmtpUser, setEmailSmtpUserState] = useState<string>("");
  const [emailSmtpPass, setEmailSmtpPassState] = useState<string>("");
  const [emailFromName, setEmailFromNameState] = useState<string>("Pousada Sol & Mar - Reservas");
  const [emailFromAddress, setEmailFromAddressState] = useState<string>("reserva@pousada.com.br");
  const [emailFooterText, setEmailFooterTextState] = useState<string>("Obrigado por escolher a Pousada Sol & Mar! Em caso de dúvidas, entre em contato com nossa equipe.");
  const [sendVoucherEmailEnabled, setSendVoucherEmailEnabledState] = useState<boolean>(true);
  const [sendReceiptEmailEnabled, setSendReceiptEmailEnabledState] = useState<boolean>(true);
  const [sendPaymentConfirmEmailEnabled, setSendPaymentConfirmEmailEnabledState] = useState<boolean>(true);

  // Load from localStorage on mount & sync HTML data-theme
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("hoteisnet_theme") as ThemeId;
      if (savedTheme && THEMES[savedTheme]) {
        setCurrentThemeState(savedTheme);
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", savedTheme);
        }
      } else {
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      }
      const savedLogo = localStorage.getItem("hoteisnet_logo");
      if (savedLogo) setHotelLogoState(savedLogo);

      const savedName = localStorage.getItem("hoteisnet_hotel_name");
      if (savedName) setHotelNameState(savedName);

      const savedHeaderLogo = localStorage.getItem("hoteisnet_header_logo");
      if (savedHeaderLogo !== null) setShowLogoInHeaderState(savedHeaderLogo === "true");

      const savedPrintLogo = localStorage.getItem("hoteisnet_print_logo");
      if (savedPrintLogo !== null) setShowLogoInPrintState(savedPrintLogo === "true");

      const savedCheckIn = localStorage.getItem("hoteisnet_checkin_time");
      if (savedCheckIn) setDefaultCheckInTimeState(savedCheckIn);

      const savedCheckOut = localStorage.getItem("hoteisnet_checkout_time");
      if (savedCheckOut) setDefaultCheckOutTimeState(savedCheckOut);

      const savedUazapiServer = localStorage.getItem("hoteisnet_uazapi_server");
      if (savedUazapiServer) setUazapiServerUrlState(savedUazapiServer);

      const savedUazapiToken = localStorage.getItem("hoteisnet_uazapi_token");
      if (savedUazapiToken) setUazapiInstanceTokenState(savedUazapiToken);

      const savedWaSound = localStorage.getItem("hoteisnet_wa_sound_enabled");
      if (savedWaSound !== null) setWhatsappSoundEnabledState(savedWaSound === "true");

      const savedEscalationSound = localStorage.getItem("hoteisnet_escalation_sound_enabled");
      if (savedEscalationSound !== null) setHumanInterventionSoundEnabledState(savedEscalationSound === "true");

      const savedTolerance = localStorage.getItem("hoteisnet_reservation_tolerance");
      if (savedTolerance) setReservationToleranceHoursState(Number(savedTolerance));

      // Configurações de E-mail
      const savedHost = localStorage.getItem("hoteisnet_email_host");
      if (savedHost) setEmailSmtpHostState(savedHost);

      const savedPort = localStorage.getItem("hoteisnet_email_port");
      if (savedPort) setEmailSmtpPortState(Number(savedPort));

      const savedSecure = localStorage.getItem("hoteisnet_email_secure");
      if (savedSecure) setEmailSmtpSecureState(savedSecure);

      const savedUser = localStorage.getItem("hoteisnet_email_user");
      if (savedUser) setEmailSmtpUserState(savedUser);

      const savedPass = localStorage.getItem("hoteisnet_email_pass");
      if (savedPass) setEmailSmtpPassState(savedPass);

      const savedFromName = localStorage.getItem("hoteisnet_email_from_name");
      if (savedFromName) setEmailFromNameState(savedFromName);

      const savedFromAddress = localStorage.getItem("hoteisnet_email_from_address");
      if (savedFromAddress) setEmailFromAddressState(savedFromAddress);

      const savedFooter = localStorage.getItem("hoteisnet_email_footer");
      if (savedFooter) setEmailFooterTextState(savedFooter);

      const savedVoucherOpt = localStorage.getItem("hoteisnet_email_opt_voucher");
      if (savedVoucherOpt !== null) setSendVoucherEmailEnabledState(savedVoucherOpt === "true");

      const savedReceiptOpt = localStorage.getItem("hoteisnet_email_opt_receipt");
      if (savedReceiptOpt !== null) setSendReceiptEmailEnabledState(savedReceiptOpt === "true");

      const savedPayOpt = localStorage.getItem("hoteisnet_email_opt_payment");
      if (savedPayOpt !== null) setSendPaymentConfirmEmailEnabledState(savedPayOpt === "true");
    } catch (e) {
      console.error("Failed to load theme settings from localStorage", e);
    }
  }, []);

  // Horários padrão e tolerância de chegada antecipada são autoritativos no banco (Tenant) —
  // o localStorage acima é só cache offline até esta busca responder. O backend usa esses mesmos
  // valores para validar a chegada antecipada dentro da transação do check-in.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tenant/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success || !data.settings) return;
        const s = data.settings;
        if (s.standardCheckInTime) {
          setDefaultCheckInTimeState(s.standardCheckInTime);
          try { localStorage.setItem("hoteisnet_checkin_time", s.standardCheckInTime); } catch {}
        }
        if (s.standardCheckOutTime) {
          setDefaultCheckOutTimeState(s.standardCheckOutTime);
          try { localStorage.setItem("hoteisnet_checkout_time", s.standardCheckOutTime); } catch {}
        }
        if (typeof s.earlyCheckinToleranceMinutes === "number") {
          setEarlyCheckinToleranceMinutesState(s.earlyCheckinToleranceMinutes);
        }
        if (s.earlyArrivalDefaultCharge) setEarlyArrivalDefaultChargeState(s.earlyArrivalDefaultCharge);
        if (s.overnightArrivalDefaultCharge) setOvernightArrivalDefaultChargeState(s.overnightArrivalDefaultCharge);
        if (typeof s.earlyCheckinFixedFeeAmount === "number") setEarlyCheckinFixedFeeAmountState(s.earlyCheckinFixedFeeAmount);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const setTheme = (themeId: ThemeId) => {
    if (THEMES[themeId]) {
      setCurrentThemeState(themeId);
      localStorage.setItem("hoteisnet_theme", themeId);
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", themeId);
      }
    }
  };

  const setHotelLogo = (logoUrl: string | null) => {
    setHotelLogoState(logoUrl);
    if (logoUrl) {
      localStorage.setItem("hoteisnet_logo", logoUrl);
    } else {
      localStorage.removeItem("hoteisnet_logo");
    }
  };

  const setHotelName = (name: string) => {
    setHotelNameState(name);
    localStorage.setItem("hoteisnet_hotel_name", name);
  };

  const setShowLogoInHeader = (val: boolean) => {
    setShowLogoInHeaderState(val);
    localStorage.setItem("hoteisnet_header_logo", String(val));
  };

  const setShowLogoInPrint = (val: boolean) => {
    setShowLogoInPrintState(val);
    localStorage.setItem("hoteisnet_print_logo", String(val));
  };

  const setDefaultCheckInTime = (time: string) => {
    setDefaultCheckInTimeState(time);
    localStorage.setItem("hoteisnet_checkin_time", time);
  };

  const setDefaultCheckOutTime = (time: string) => {
    setDefaultCheckOutTimeState(time);
    localStorage.setItem("hoteisnet_checkout_time", time);
  };

  const setUazapiServerUrl = (url: string) => {
    setUazapiServerUrlState(url);
    localStorage.setItem("hoteisnet_uazapi_server", url);
  };

  const setUazapiInstanceToken = (token: string) => {
    setUazapiInstanceTokenState(token);
    localStorage.setItem("hoteisnet_uazapi_token", token);
  };

  const setWhatsappSoundEnabled = (val: boolean) => {
    setWhatsappSoundEnabledState(val);
    localStorage.setItem("hoteisnet_wa_sound_enabled", String(val));
  };

  const setHumanInterventionSoundEnabled = (val: boolean) => {
    setHumanInterventionSoundEnabledState(val);
    localStorage.setItem("hoteisnet_escalation_sound_enabled", String(val));
  };

  const setReservationToleranceHours = (hours: number) => {
    setReservationToleranceHoursState(hours);
    localStorage.setItem("hoteisnet_reservation_tolerance", String(hours));
  };

  const setEmailSmtpHost = (host: string) => {
    setEmailSmtpHostState(host);
    localStorage.setItem("hoteisnet_email_host", host);
  };

  const setEmailSmtpPort = (port: number) => {
    setEmailSmtpPortState(port);
    localStorage.setItem("hoteisnet_email_port", String(port));
  };

  const setEmailSmtpSecure = (sec: string) => {
    setEmailSmtpSecureState(sec);
    localStorage.setItem("hoteisnet_email_secure", sec);
  };

  const setEmailSmtpUser = (user: string) => {
    setEmailSmtpUserState(user);
    localStorage.setItem("hoteisnet_email_user", user);
  };

  const setEmailSmtpPass = (pass: string) => {
    setEmailSmtpPassState(pass);
    localStorage.setItem("hoteisnet_email_pass", pass);
  };

  const setEmailFromName = (name: string) => {
    setEmailFromNameState(name);
    localStorage.setItem("hoteisnet_email_from_name", name);
  };

  const setEmailFromAddress = (email: string) => {
    setEmailFromAddressState(email);
    localStorage.setItem("hoteisnet_email_from_address", email);
  };

  const setEmailFooterText = (text: string) => {
    setEmailFooterTextState(text);
    localStorage.setItem("hoteisnet_email_footer", text);
  };

  const setSendVoucherEmailEnabled = (val: boolean) => {
    setSendVoucherEmailEnabledState(val);
    localStorage.setItem("hoteisnet_email_opt_voucher", String(val));
  };

  const setSendReceiptEmailEnabled = (val: boolean) => {
    setSendReceiptEmailEnabledState(val);
    localStorage.setItem("hoteisnet_email_opt_receipt", String(val));
  };

  const setSendPaymentConfirmEmailEnabled = (val: boolean) => {
    setSendPaymentConfirmEmailEnabledState(val);
    localStorage.setItem("hoteisnet_email_opt_payment", String(val));
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        theme: THEMES[currentTheme],
        setTheme,
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
        earlyCheckinToleranceMinutes,
        earlyArrivalDefaultCharge,
        overnightArrivalDefaultCharge,
        earlyCheckinFixedFeeAmount,
        uazapiServerUrl,
        setUazapiServerUrl,
        uazapiInstanceToken,
        setUazapiInstanceToken,
        whatsappSoundEnabled,
        setWhatsappSoundEnabled,
        humanInterventionSoundEnabled,
        setHumanInterventionSoundEnabled,
        reservationToleranceHours,
        setReservationToleranceHours,
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
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
